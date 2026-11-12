"""Executable LangGraph supervisor and multi-question scheduler with streaming and persistence."""

import asyncio
import json
import re
import time
from collections.abc import Callable
from uuid import UUID, uuid4
from contextvars import ContextVar

from langgraph.graph import END, START, StateGraph

from app.business.mcp.context import ExecutionContext
from app.model.config.settings import settings
from .catalog import AGENT_TOOLS
from .models import (CitedSource, MultiAgentResult, PlannedQuestion, QuestionResult,
                     QuestionPlanItem, QuestionState, StreamEvent, StreamEventType)
from .planning import plan_questions, proposal_search_query
from .tools import build_tools
from .observability import ExecutionTrace, LLM_OBSERVER, run_metrics, utc_now
from .synthesis import CitationRegistry, combined_response, synthesize, supported_amounts
from .budgets import budget_answer
from .claims import blocking_flags, verify_claims
from .progressive import ProgressiveAssembler, unavailable_text
from .quality import verify_citations
from .requirements import (RequirementLedger, COMPLETED, FAILED, RUNNING, SKIPPED, CANCELLED as REQ_CANCELLED,
                           MISSING_EVIDENCE, EXECUTION_ERROR)
from .scheduling import BoundedScheduler, Job, OK as TASK_OK, TIMEOUT as TASK_TIMEOUT, DEADLINE as TASK_DEADLINE, \
    CANCELLED as TASK_CANCELLED, DEPENDENCY_FAILED as TASK_DEP_FAILED
from app.business.evaluation.tracing import measured_sum
from app.business.rag.ollama_answers import ABSTENTION
from app.model.config.limits import MAX_QUESTIONS, MAX_TOTAL_CHARS

PLACEHOLDER = "Retrieved supporting source material"
_KIND = {TASK_TIMEOUT: "timeout", TASK_DEADLINE: "deadline", TASK_CANCELLED: "cancelled", TASK_DEP_FAILED: "dependency_failed"}


class MultiAgentWorkflow:
    def __init__(self, context: ExecutionContext, *, concurrency: int | None = None,
                 max_retries: int | None = None, max_total_time_sec: int | None = None,
                 question_timeout_sec: int | None = None):
        self.context = context
        self.concurrency = concurrency or settings.agent_concurrency
        self.max_retries = max_retries or settings.agent_max_retries
        self.max_total_time_sec = max_total_time_sec or settings.agent_max_total_time_sec
        self.question_timeout_sec = question_timeout_sec or settings.agent_question_timeout_sec
        if not 1 <= self.concurrency <= 8 or not 1 <= self.max_retries <= 3:
            raise ValueError("Invalid agent concurrency or retry limit.")
        self._telemetry = ContextVar("question_trace", default=None)
        self._current_agent = ContextVar("agent", default="supervisor")
        self.tools = build_tools(context)
        self._fast_model_available = None
        self._model_lock = asyncio.Lock()
        self._generation_lock = asyncio.Lock()
        self._tool_cache = {}
        self._tool_locks = {}
        self.graph = self._build_graph()

    async def run(self, questions: str | list[str], *, dao_id: str, proposal_id: str | None = None,
                  top_k: int = 4, conversation_history: list[dict] | None = None,
                  question_plan: list[QuestionPlanItem] | None = None,
                  stream_callback: Callable[[StreamEvent], None] | None = None,
                  run_id: UUID | None = None, conversation_id: UUID | None = None,
                  strategy: str = "multi_agent_rag_blockchain",
                  original_request: str | None = None) -> MultiAgentResult:
        """Run the multi-agent workflow with optional streaming and conversation history."""
        start_time = time.time()
        run_started = utc_now()
        self.strategy = strategy
        self._llm_planned = question_plan is not None
        self._tool_cache.clear()
        
        if isinstance(questions, list) and len(questions) > MAX_QUESTIONS:
            raise ValueError(f"Maximum {MAX_QUESTIONS} questions per request.")
        if isinstance(questions, list) and sum(len(q) for q in questions) > MAX_TOTAL_CHARS:
            raise ValueError(f"Aggregate question size exceeds {MAX_TOTAL_CHARS} characters.")
        
        plans = plan_questions(questions, question_plan)
        if strategy not in ('rag', 'multi_agent_rag', 'multi_agent_rag_blockchain'):
            raise ValueError('Unsupported execution strategy.')
        for plan in plans:
            if strategy == 'rag':
                plan.agent, plan.agents = 'evidence', ['evidence']
            elif strategy == 'multi_agent_rag':
                plan.agents = list(dict.fromkeys('analysis' if a == 'blockchain' else a for a in plan.agents))
                if plan.agent == 'blockchain': plan.agent = 'analysis'
        if not plans:
            raise ValueError("At least one question is required.")
        if original_request is not None:
            for plan in plans:
                plan.collect_only = True
        
        # Build conversation context from history
        history_context = self._build_history_context(conversation_history or [])[-2500:]
        
        if stream_callback and run_id:
            stream_callback(StreamEvent(
                event=StreamEventType.RUN_START,
                conversation_id=conversation_id,
                run_id=run_id,
                data={"questions": [p.question for p in plans], "dao_id": dao_id, "proposal_id": proposal_id}
            ))
        
        results: dict[str, QuestionResult] = {}
        self.partial = results                       # readable by the caller if the run is cancelled
        by_id = {plan.question_id: plan for plan in plans}
        order = [plan.question_id for plan in plans]
        ledger = RequirementLedger.from_plans(plans)
        self.ledger = ledger
        t0 = time.monotonic()
        elapsed_ms = lambda: (time.monotonic() - t0) * 1000
        deadline_at = start_time + self.max_total_time_sec

        def emit(name: str, data: dict):
            if stream_callback:
                stream_callback(StreamEvent(event=name, run_id=run_id, conversation_id=conversation_id, data=data))

        emit("requirements", {"requirements": ledger.to_list(), "summary": ledger.summary()})

        registry = CitationRegistry()
        synthesis_runs: list[QuestionResult] = []
        expanded: dict[str, list[QuestionResult]] = {}
        direct_context: list[QuestionResult] = []
        rejected = {"sections": 0}
        progressive = original_request is not None

        async def write_group(ids: list[str]) -> dict[str, str]:
            """Compose a bounded group of sections while other specialists keep running."""
            workers = [w for tid in ids for w in expanded.get(tid, [])]
            sections: dict[str, str] = {}
            context = [w for w in direct_context if w.question_id.split(".")[0] not in ids][-6:]
            response = await synthesize(original_request, workers + context, self.context.rag.ollama,
                await self._generation_model(), timeout=max(0.0, deadline_at - time.time()),
                registry=registry, sections_out=sections, tasks_to_write=ids)
            synthesis_runs.append(response)
            if response.model_used is None:          # synthesis fell back: keep verbatim specialist findings
                return {}
            known = [s.model_dump() for s in registry.sources.values()]
            accepted = {}
            for tid in ids:
                text = sections.get(tid)
                if not text:
                    continue
                if not verify_citations(text, known)["cited"] or blocking_flags(verify_claims(text, known)):
                    rejected["sections"] += 1        # unsupported claim: withhold the generated wording
                    continue
                accepted[tid] = text
            return accepted

        def emit_section(name: str, data: dict):
            """Section events carry the sources they cite, so the UI can show stable citations mid-stream."""
            if name == "answer_section":
                ids = list(dict.fromkeys(re.findall(r"\[((?:D|G)\d+)\]", data.get("text", ""))))
                data = {**data, "cited_sources": [registry.sources[i].model_dump(mode="json") for i in ids if i in registry.sources]}
            emit(name, data)

        assembler = ProgressiveAssembler(order, {p.question_id: p.question for p in plans}, emit_section, write_group,
                                         group_size=settings.agent_section_group_size) if progressive else None

        def register(tid: str, result: QuestionResult):
            """Canonicalize citations run-wide and split a task's workers into direct text / narrative / failed."""
            canon, parts, notes, narrative = [], [], [], []
            for w in self._workers_of(result):
                if w.status == "completed" and w.answer:
                    cw = registry.canonicalize(w)
                    canon.append(cw)
                    if cw.answer.startswith(PLACEHOLDER):
                        narrative.append(cw)
                    else:
                        parts.append(cw.answer)
                        direct_context.append(cw)
                else:
                    canon.append(w)
                    notes.append(unavailable_text(self._worker_kind(w)))
            expanded[tid] = canon
            return canon, parts, notes, narrative

        def on_start(tid: str):
            ledger.mark(tid, RUNNING, ms=elapsed_ms())
            emit("requirement_update", {"id": tid, "status": RUNNING, "elapsed_ms": elapsed_ms()})

        def on_result(tid: str, outcome):
            plan, result = by_id[tid], outcome.value
            hard_kind = _KIND.get(outcome.status)
            if result is None:
                result = self._failed(plan, outcome.error or "Task did not complete.", 0, hard_kind or EXECUTION_ERROR)
            results[tid] = result
            canon, parts, notes, narrative = register(tid, result)
            has_content = bool(parts) or bool(narrative)
            answered = any(w.status == "completed" and (w.answer or "").strip() != ABSTENTION for w in canon)
            kind = hard_kind or ((result.execution or {}).get("failure_kind") if outcome.status != TASK_OK else None)
            if outcome.status != TASK_OK and not kind:
                kind = EXECUTION_ERROR
            if has_content and not answered:
                kind = MISSING_EVIDENCE                      # completed, but the evidence does not establish it
            status = (SKIPPED if outcome.status == TASK_DEP_FAILED else
                      REQ_CANCELLED if outcome.status in (TASK_CANCELLED, TASK_DEADLINE) else
                      COMPLETED if has_content else FAILED)
            ledger.mark(tid, status, kind=kind, detail=(result.errors[0] if result.errors else None),
                        answered=has_content and answered, ms=elapsed_ms())
            emit("requirement_update", {"id": tid, "status": status, "failure_kind": kind, "answered": has_content and answered,
                                        "summary": ledger.summary(), "elapsed_ms": elapsed_ms()})
            if assembler is None:
                return
            if not has_content:
                assembler.finding(tid, ok=False, failure_kind=kind or self._worker_kind(result))
            elif narrative:
                fallback: dict[str, str] = {}
                combined_response(original_request, narrative, registry, fallback)
                assembler.finding(tid, ok=True, text="\n\n".join([*parts, fallback.get(tid, "")]).strip(),
                                  needs_write=True, suffix="\n\n".join(notes))
            else:
                assembler.finding(tid, ok=True, text="\n\n".join(parts),
                                  needs_write=any(w.cited_sources for w in canon if w.status == "completed"),
                                  suffix="\n\n".join(notes))

        async def run_plan(plan: PlannedQuestion):
            dependencies = "\n".join(
                f"{item}: {results[item].answer}" for item in plan.depends_on
                if item in results and results[item].status == "completed" and results[item].answer)
            full_context = history_context + ("\n\n" + dependencies if dependencies else "")
            return await self._run_collaborators(plan, dao_id, proposal_id, top_k, full_context,
                                                 stream_callback, run_id, conversation_id, deadline=deadline_at)

        scheduler = BoundedScheduler(
            [Job(p.question_id, (lambda p=p: run_plan(p)), tuple(p.depends_on)) for p in plans],
            concurrency=self.concurrency, deadline_s=self.max_total_time_sec,
            job_timeout_s=self.question_timeout_sec * 4, on_start=on_start, on_result=on_result,
            is_success=lambda value: value.status == "completed")
        self.scheduler = scheduler
        if assembler:
            assembler.start()
        try:
            await scheduler.run()
        except asyncio.CancelledError:
            if assembler:
                await assembler.abort()
            raise
        if assembler:
            await assembler.close()

        ordered = [results[qid] for qid in order]
        successes = sum(result.status == "completed" for result in ordered)
        status = "completed" if successes == len(ordered) else (
            "partial_failure" if successes else "failed")

        if stream_callback and run_id:
            stream_callback(StreamEvent(
                event=StreamEventType.RUN_COMPLETE,
                conversation_id=conversation_id,
                run_id=run_id,
                data={"status": status, "total_ms": (time.time() - start_time) * 1000}
            ))

        worker_results = [w for qid in order for w in expanded.get(qid, [])]
        final_response, claims, stats = None, None, None
        if progressive:
            answer = assembler.assemble()
            known = [s.model_dump() for s in registry.sources.values()]
            claims = verify_claims(answer, known)
            checked = verify_citations(answer, known)
            cited_ids = set(re.findall(r"\[((?:D|G)\d+)\]", answer))
            stats = assembler.stats()
            errors = []
            if any(r.status != "completed" for r in ordered):
                errors.append("Some checks could not complete. Available findings are shown; see execution details for failed checks.")
            if stats["fallback"] or rejected["sections"]:
                errors.append("Combined wording was unavailable for some sections; showing the supported specialist findings.")
            runs = [r.execution for r in synthesis_runs if r.execution]
            merged = {"trace": [s for e in runs for s in e.get("trace", [])], "agents": ["synthesis"] if runs else [],
                      "models": list(dict.fromkeys(m for e in runs for m in e.get("models", []))),
                      "input_tokens": measured_sum(e.get("input_tokens") for e in runs) if runs else 0,
                      "output_tokens": measured_sum(e.get("output_tokens") for e in runs) if runs else 0,
                      "embedding_tokens": 0, "tool_calls": 0, "tool_successes": 0,
                      "retries": sum(e.get("retries", 0) for e in runs), "llm_ms": sum(e.get("llm_ms", 0) for e in runs),
                      "retrieval_ms": 0, "tool_ms": 0}
            final_response = QuestionResult(
                question_id="response", question=original_request, agent="synthesis",
                status="completed" if any(sec.source != "unavailable" for sec in assembler.sections.values()) else "failed",
                answer=answer, citations=sorted(cited_ids),
                cited_sources=[s for s in registry.sources.values() if s.source_id in cited_ids], errors=errors,
                model_used=next((r.model_used for r in reversed(synthesis_runs) if r.model_used), None),
                generation_ms=sum(r.generation_ms for r in synthesis_runs),
                input_tokens=merged["input_tokens"], output_tokens=merged["output_tokens"],
                total_ms=elapsed_ms(), execution=merged,
                worker_results=[w.model_dump(mode="json") for w in worker_results],
                blockchain_verification=next((w.blockchain_verification for w in worker_results if w.blockchain_verification), None))
            claims["citations_valid"] = checked["valid"]
        elapsed = (time.time()-start_time)*1000
        measured = worker_results + ([final_response] if final_response and final_response.execution else [])
        extra = {"strategy": strategy, "requirements": ledger.summary(), "requirement_list": ledger.to_list(),
                 "scheduler": {"tasks": len(plans), "concurrency": self.concurrency, "max_in_flight": scheduler.max_in_flight},
                 "routing_dropped": {p.question_id: p.dropped_agents for p in plans if p.dropped_agents}}
        if progressive:
            extra.update(progressive=stats, sections_rejected=rejected["sections"],
                         claims={k: claims[k] for k in ("method", "claims_total", "claims_factual", "counts", "unsupported_claims",
                                                       "unsupported_rate_lower_bound", "numeric_faithfulness", "citations_valid")},
                         time_marks={"first_finding_ms": stats.get("first_finding_ms"),
                                     "first_section_ms": stats.get("first_section_ms"),
                                     "first_meaningful_section_ms": stats.get("first_meaningful_section_ms"),
                                     "final_ms": stats.get("final_ms")})
        return MultiAgentResult(status=status, results=ordered,
            metrics={**run_metrics(measured, elapsed, run_started, utc_now()), **extra},
            trace=[span for item in measured for span in item.execution.get('trace',[])],
            final_response=final_response)

    def cancel(self) -> None:
        """Ask the running scheduler to stop; completed results are kept and unfinished tasks are marked cancelled."""
        scheduler = getattr(self, "scheduler", None)
        if scheduler:
            scheduler.cancel()

    def partial_results(self) -> list[QuestionResult]:
        return list(getattr(self, "partial", {}).values())

    @staticmethod
    def _workers_of(result: QuestionResult) -> list[QuestionResult]:
        return [QuestionResult.model_validate(w) for w in (result.worker_results or [result.model_dump(mode="json")])]

    @staticmethod
    def _worker_kind(result: QuestionResult) -> str:
        return (result.execution or {}).get("failure_kind") or EXECUTION_ERROR

    async def _run_collaborators(self, plan, dao_id, proposal_id, top_k, dependencies,
                                 stream_callback=None, run_id=None, conversation_id=None, deadline=None):
        agents = plan.agents or [plan.agent]
        workers = []
        # Keep local generation bounded. The task scheduler still runs independent
        # tasks concurrently when explicitly configured; workers share tool results.
        for agent in agents:
            worker = plan.model_copy(update={"question_id": f"{plan.question_id}.{agent}" if len(agents) > 1 else plan.question_id,
                "agent": agent, "agents": []})
            remaining = self.question_timeout_sec if deadline is None else min(self.question_timeout_sec, deadline - time.time())
            if remaining <= 0:
                workers.append(self._failed(worker, "Workflow time budget exhausted before this specialist check.", 0, "deadline"))
                continue
            try:
                workers.append(await asyncio.wait_for(self._run_question(worker, dao_id, proposal_id,
                    top_k, dependencies, stream_callback, run_id, conversation_id), remaining))
            except asyncio.TimeoutError:
                workers.append(self._failed(worker, "This specialist check timed out.", 0, "timeout"))
        if len(workers) == 1:
            return workers[0]
        result = combined_response(plan.question, workers)
        result.question_id = plan.question_id
        result.agent = plan.agent
        result.status = "completed" if all(w.status == "completed" for w in workers) else "failed"
        result.tool_calls = sum(w.tool_calls for w in workers)
        return result

    def _build_history_context(self, history: list[dict]) -> str:
        """Build context string from conversation history."""
        if not history:
            return ""
        parts = []
        for msg in history[-10:]:  # Last 10 messages
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role and content:
                parts.append(f"{role}: {content}")
        return "\n".join(parts) if parts else ""

    async def _run_question(self, plan: PlannedQuestion, dao_id: str, proposal_id: str | None,
                            top_k: int, dependencies: str,
                            stream_callback: Callable[[StreamEvent], None] | None = None,
                            run_id: UUID | None = None, conversation_id: UUID | None = None) -> QuestionResult:
        question_start = time.time()
        def trace_event(row):
            if stream_callback:
                stream_callback(StreamEvent(event='execution_update', question_id=plan.question_id,
                    run_id=run_id, conversation_id=conversation_id, data=row))
        telemetry = ExecutionTrace(plan.question_id, trace_event)
        telemetry.route = plan.agent
        self._telemetry.set(telemetry)
        LLM_OBSERVER.set(telemetry.llm)
        route = telemetry.begin('routing', 'supervisor.route', 'supervisor',
            selected_agent=plan.agent, rule='llm_plan' if getattr(self, '_llm_planned', False) else 'legacy_classifier', depends_on=plan.depends_on,
            strategy=getattr(self, 'strategy', 'multi_agent_rag_blockchain'))
        telemetry.end(route)
        
        if stream_callback and run_id:
            stream_callback(StreamEvent(
                event=StreamEventType.QUESTION_START,
                conversation_id=conversation_id,
                run_id=run_id,
                question_id=plan.question_id,
                data={"question": plan.question, "agent": plan.agent}
            ))
        
        initial: QuestionState = {
            "plan": {**plan.model_dump(), "dao_id": dao_id,
                     "proposal_id": proposal_id, "top_k": top_k},
            "dependency_context": dependencies,
            "answer": "", "evidence": [], "citations": [], "errors": [],
            "status": "pending", "attempts": 0, "tool_calls": 0,
            "model_used": None, "retrieval_ms": 0, "generation_ms": 0,
            "total_ms": 0, "input_tokens": None, "output_tokens": None,
            "embedding_tokens": None,
        }
        
        try:
            state = await self.graph.ainvoke(
                initial, config={"recursion_limit": self.max_retries * 3 + 4})
        except asyncio.CancelledError:
            raise
        except BaseException as exc:
            error = f"Question exceeded timeout of {self.question_timeout_sec}s" if isinstance(exc, asyncio.CancelledError) else f"{type(exc).__name__}: {exc}"
            if stream_callback and run_id:
                stream_callback(StreamEvent(
                    event=StreamEventType.QUESTION_ERROR,
                    conversation_id=conversation_id,
                    run_id=run_id,
                    question_id=plan.question_id,
                    data={"error": error}
                ))
            failed = self._failed(plan, error, (time.time() - question_start)*1000)
            failed.execution = {**telemetry.result(), "failure_kind": "execution_error"}
            return failed
        
        execution = telemetry.result()
        if state.get("status") != "completed":
            execution["failure_kind"] = state.get("failure_kind") or "execution_error"
        cited_sources = []
        if state.get("status") == "completed":
            cited_ids = set(state.get("citations", []))
            for item in state.get("evidence", []):
                if item.get("source_id") in cited_ids:
                    cited_sources.append(CitedSource(
                        source_id=item["source_id"],
                        content=item["content"] if isinstance(item["content"], str) else json.dumps(item["content"], default=str),
                        metadata={k: v for k, v in item.items() if k not in ("source_id", "content")}
                    ))
            
            if stream_callback and run_id:
                stream_callback(StreamEvent(
                    event=StreamEventType.QUESTION_COMPLETE,
                    conversation_id=conversation_id,
                    run_id=run_id,
                    question_id=plan.question_id,
                    data={
                        "answer": state.get("answer"),
                        "citations": state.get("citations", []),
                        "agent": plan.agent,
                        "attempts": state.get("attempts", 0),
                        "cited_sources": [source.model_dump(mode="json") for source in cited_sources],
                        "execution": execution, "blockchain_verification": telemetry.blockchain
                    }
                ))
        
        return QuestionResult(
            question_id=plan.question_id, question=plan.question, agent=plan.agent,
            status="completed" if state.get("status") == "completed" else "failed",
            answer=state.get("answer") or None, citations=state.get("citations", []),
            cited_sources=cited_sources, errors=state.get("errors", []),
            attempts=state.get("attempts", 0), tool_calls=execution["tool_calls"],
            model_used=execution['models'][-1] if execution['models'] else state.get('model_used'), retrieval_ms=execution['retrieval_ms'],
            generation_ms=execution['llm_ms'], total_ms=execution['latency_ms'],
            input_tokens=execution['input_tokens'], output_tokens=execution['output_tokens'],
            embedding_tokens=execution['embedding_tokens'], execution=execution,
            blockchain_verification=telemetry.blockchain,
        )

    def _build_graph(self):
        builder = StateGraph(QuestionState)
        builder.add_node("supervisor", self._supervisor)
        for agent in ("proposal", "evidence", "research", "governance", "analysis", "blockchain"):
            builder.add_node(agent, self._agent_node(agent))
            builder.add_edge(agent, "verify")
        builder.add_node("verify", self._verify)
        builder.add_edge(START, "supervisor")
        routes = {name: name for name in
                  ("proposal", "evidence", "research", "governance", "analysis", "blockchain")}
        builder.add_conditional_edges("supervisor", self._route, routes)
        builder.add_conditional_edges("verify", self._after_verify,
                                      {**routes, "end": END})
        return builder.compile()

    async def _supervisor(self, state: QuestionState) -> dict:
        return {"status": "routed"}

    @staticmethod
    def _route(state: QuestionState) -> str:
        return state["plan"]["agent"]

    def _agent_node(self, agent: str):
        async def execute(state: QuestionState) -> dict:
            attempts = state.get("attempts", 0) + 1
            q_start = time.time()
            telemetry = self._telemetry.get()
            span = telemetry.begin('agent', agent, agent, attempt=attempts) if telemetry else None
            try:
                outputs = await self._execute_tools(agent, state["plan"])
                evidence = self._evidence(outputs, state.get("dependency_context", ""))
                
                retrieval_ms = sum(
                    r.get("retrieval_ms", 0) for r in outputs 
                    if isinstance(r, dict) and "result" in r
                )
                
                question = state["plan"]["question"]
                direct_answer = (
                    self._chain_vote_answer(question, evidence) if agent == "blockchain"
                    else (" ".join(filter(None, (self._stored_member_answer(question, evidence),
                          self._stored_voting_answer(question, evidence)))) or None) if agent == "governance"
                    else self._research_count_answer(evidence) if agent == "research"
                    else self._proposal_fact_answer(question, evidence)
                    if agent in ("proposal", "analysis") else None
                )
                if direct_answer is None and agent == "evidence":
                    direct_answer = budget_answer(question, evidence)
                if direct_answer:
                    answer, gen_ms, tokens = direct_answer, 0, {}
                elif not evidence:
                    answer = "The available evidence does not establish that."
                    gen_ms = 0
                    tokens = {}
                elif state["plan"].get("collect_only"):
                    # Specialists supply source facts; one final LLM composes the
                    # response instead of N worker generations plus synthesis.
                    answer = "Retrieved supporting source material " + " ".join(
                        f"[{item['source_id']}]" for item in evidence)
                    gen_ms, tokens = 0, {}
                else:
                    context = "\n\n".join(
                        f"[{item['source_id']}] {json.dumps(item['content'], default=str)}"
                        for item in evidence)
                    if agent == "evidence" and re.search(r"\b(what.*(?:pdf|document)|summari[sz]e|summerize|sumerize)\b", state["plan"]["question"], re.I):
                        context += "\nThe user requests an overview of the supplied attached document excerpts. Summarize their actual purpose, scope and deliverables with document citations. A generic wording does not require abstention when document text is present."
                    if state.get('errors'):
                        context += '\nCitation correction: ' + '; '.join(state['errors'])
                    model = await self._generation_model()
                    if state.get("dependency_context"):
                        context += "\n\nCONVERSATION CONTEXT (for resolving references only; not evidence):\n" + state["dependency_context"]
                    answer, gen_ms, tokens = await self._chat_with_fallback(
                        state["plan"]["question"], context, model)
                    if answer.strip() == "The available evidence does not establish that.":
                        # One bounded review of an abstention with supplied facts.
                        # This does not override missing evidence or citation gates.
                        review = telemetry.begin('retry', 'grounding_review', agent) if telemetry else None
                        try:
                            answer, review_ms, tokens = await self._chat_with_fallback(
                                state["plan"]["question"], context +
                                "\nGROUNDING REVIEW: Recheck the same question against the supplied facts, including ordinary paraphrases and field names. Answer only the supported part with citations. If the evidence is unrelated or the requested fact is missing, retain the exact abstention. Do not invent missing information.", model)
                            gen_ms += review_ms
                        finally:
                            if telemetry and review: telemetry.end(review)

                
                total_ms = (time.time() - q_start) * 1000
                return {"answer": answer, "evidence": evidence, "attempts": attempts,
                        "tool_calls": state.get("tool_calls", 0) + len(outputs),
                        "errors": [], "status": "answered",
                        "model_used": model if 'model' in locals() else None,
                        "retrieval_ms": retrieval_ms, "generation_ms": gen_ms,
                        "total_ms": total_ms, "input_tokens": tokens.get("input_tokens"),
                        "output_tokens": tokens.get("output_tokens"),
                        "embedding_tokens": tokens.get("_embedding_tokens")}
            except Exception as exc:
                if telemetry and span: telemetry.end(span, 'failed', error_type=type(exc).__name__)
                return {"attempts": attempts, "status": "failed", "failure_kind": "execution_error",
                        "errors": [f"{type(exc).__name__}: {exc}"]}
            finally:
                if telemetry and span and span[0]['status'] == 'processing': telemetry.end(span)
        return execute

    async def _execute_tools(self, agent: str, plan: dict) -> list[dict]:
        self._current_agent.set(agent)
        scope = {"dao_id": plan["dao_id"], "proposal_id": plan.get("proposal_id")}
        if agent == "blockchain":
            return [await self._invoke('compare_on_chain_off_chain', scope)]
        if agent == "proposal":
            return [await self._invoke("get_proposal", scope),
                    await self._invoke("get_proposal_time_window", scope)]
        if agent == "evidence":
            return [await self._invoke("search_proposal_evidence", {
                **scope, "question": plan["question"], "top_k": plan["top_k"]})]
        if agent == "analysis" and re.search(
            r"\b(summar(?:y|ize|ise)|overview)\b", plan["question"], re.I
        ) and not re.search(
            r"\b(pdf|document|attachment|evidence|source|citation|risks?|benefits?|recommend(?:ation)?s?|implications?)\b",
            plan["question"], re.I
        ):
            return [await self._invoke("get_proposal", scope)]
        if agent == "research":
            # DAO-wide discovery must not collapse to the currently open proposal.
            if re.search(r"\b(how\s+many|number of|count|total)\b", plan["question"], re.IGNORECASE):
                return [await self._invoke("count_dao_proposals", {"dao_id": plan["dao_id"]})]
            if re.search(r"\b(list|show)\b", plan["question"], re.I) and not re.search(r"\b(about|regarding|related to)\b", plan["question"], re.I):
                return [await self._invoke("list_dao_proposals", {"dao_id": plan["dao_id"], "limit": 20})]
            return [await self._invoke("search_dao_proposals", {
                "dao_id": plan["dao_id"], "query": proposal_search_query(plan["question"]), "limit": 20})]
        if agent == "governance":
            return [await self._invoke("get_proposal_voting_facts", scope),
                    await self._invoke("get_proposal_time_window", scope)]
        return [await self._invoke("get_proposal", scope),
                await self._invoke("search_proposal_evidence", {
                    **scope, "question": plan["question"], "top_k": plan["top_k"]}),
                await self._invoke("get_proposal_voting_facts", scope)]

    async def _invoke(self, name: str, arguments: dict) -> dict:
        if name not in self.tools:
            raise RuntimeError(f"Tool {name} not available.")
        allowed = AGENT_TOOLS.get(self._current_agent.get(), ())
        if name not in allowed and name != "verify_citations":
            raise RuntimeError(f"Tool {name} not permitted.")
        telemetry = self._telemetry.get()
        span = telemetry.begin('tool', name, self._current_agent.get(), arguments={k:v for k,v in arguments.items() if k != 'question'}) if telemetry else None
        try:
            key = json.dumps([name, arguments], sort_keys=True, default=str)
            lock = self._tool_locks.setdefault(key, asyncio.Lock())
            async with lock:
                cached = key in self._tool_cache
                if cached:
                    result = self._tool_cache[key]
                    if telemetry and span:
                        span[0]['kind'] = 'cache'
                else:
                    result = await self.tools[name].ainvoke(arguments)
                    if not (isinstance(result, dict) and result.get('success') is False):
                        self._tool_cache[key] = result
            if isinstance(result, dict) and result.get('success') is False:
                error = result.get('error') or {}
                raise RuntimeError(error.get('message', f'Tool {name} failed.'))
            data = result.get('data', result) if isinstance(result, dict) else {}
            if telemetry and name == 'compare_on_chain_off_chain': telemetry.blockchain = data
            if telemetry and span:
                telemetry.end(span, 'unavailable' if name == 'compare_on_chain_off_chain' and data.get('status') == 'unavailable' else 'completed', retrieval_ms=data.get('retrieval_ms'), embedding_tokens=data.get('embedding_tokens'),
                              verification_status=data.get('status') if name == 'compare_on_chain_off_chain' else None)
            return {'tool': name, 'result': result}
        except BaseException as exc:
            if telemetry and span: telemetry.end(span, 'failed', error_type=type(exc).__name__)
            raise

    @staticmethod
    def _evidence(outputs: list[dict], dependency_context: str) -> list[dict]:
        evidence = []
        for output in outputs:
            result = output["result"]
            data = result.get("data") if isinstance(result, dict) and "data" in result else result
            rows = data.get("evidence") if isinstance(data, dict) else None
            if output['tool'] == 'compare_on_chain_off_chain' and isinstance(data, dict):
                # Keep complete RPC evidence in the response/database, but avoid
                # repeating receipt/event JSON throughout the finite LLM context.
                summary = {k:data.get(k) for k in ('status','chain_id','contract','block_number','observed_at','proposal','voting_status','vote_counts','errors','scope')}
                summary['proposal'] = {k:v for k,v in (data.get('proposal') or {}).items() if k != 'metadataURI'}
                summary['interpretation'] = 'Overall status describes completeness of database comparison. Missing database values do not invalidate successfully read on-chain facts. Report available on-chain facts with their block and explain any missing comparison separately.'
                summary['comparisons'] = [{'field':c['field'],'status':c['status']} for c in data.get('comparisons',[])]
                summary['discrepancies'] = [{'field':c['field'], 'database':c.get('database'), 'blockchain':c.get('blockchain')} for c in data.get('comparisons',[]) if c['status']=='mismatched' and not isinstance(c.get('blockchain'), dict)][:10]
                summary['events'] = [{k:e.get(k) for k in ('name','block_number','transaction_hash','status')} for e in data.get('events',[])[:5]]
                summary['transactions'] = [{k:t.get(k) for k in ('hash','block_number','status')} for t in data.get('transactions',[])[:5]]
                summary['event_count'] = len(data.get('events',[]))
                summary['transaction_count'] = len(data.get('transactions',[]))
                summary['display_limit'] = 'First 5 events and transactions; complete evidence is in the verification panel.'
                evidence.append({'source_id':f'G{len(evidence)+1}', 'content':summary, 'source':'blockchain',
                    'chain_id':data.get('chain_id'), 'contract':data.get('contract'), 'block_number':data.get('block_number'),
                    'verification_status':data.get('status'), 'tool':output['tool']})
                continue
            if rows is None and data and output["tool"] != "search_proposal_evidence":
                # Structured governance tools return facts directly, not an evidence array.
                # Give each record a distinct label and retain its provenance.
                evidence.append({"source_id": f"G{len(evidence) + 1}", "content": data,
                                 "source": "blockchain" if output["tool"] == "compare_on_chain_off_chain" else "governance-db", "tool": output["tool"]})
            if rows is not None:
                evidence.extend({"source_id": row["source_id"], "content": row["content"],
                                 **{key: value for key, value in row.items()
                                    if key not in ("source_id", "content")}}
                                for row in rows)
        return evidence

    @staticmethod
    def _chain_vote_answer(question: str, evidence: list[dict]) -> str | None:
        # Exact read-only facts need no generative inference. Retain provenance
        # and do not turn a missing DB comparison into missing chain evidence.
        members = MultiAgentWorkflow._asks_member_count(question)
        verification = bool(re.search(r"\b(verify|compare)\b", question, re.I))
        if not members and not verification and not re.search(r"\b(how many votes|vote count|votes (?:are |were )?cast)\b", question, re.I):
            return None
        if re.search(r"\b(why|risk|explain|predict)\b", question, re.I):
            return None
        for item in evidence:
            data = item.get('content', {})
            if data.get('errors') or item.get('source') != 'blockchain' or data.get('status') not in ('verified', 'unverified', 'mismatched'):
                continue
            proposal = data.get('proposal') or {}
            count = proposal.get('assignedMemberCount' if members else 'voteCount')
            block = data.get('block_number')
            if count is None or block is None:
                continue
            label = item['source_id']
            counts = ', '.join(f"Option {i}: {v}" for i,v in enumerate(data.get('vote_counts') or []))
            fact = f"{count} member(s) assigned to this proposal" if members else f"{count} vote(s) cast"
            if verification:
                fact = f"{proposal.get('assignedMemberCount')} assigned member(s) and {proposal.get('voteCount')} vote(s) cast; voting status: {data.get('voting_status')}"
            answer = f"The contract reports {fact} at block {block} on chain {data.get('chain_id')} [{label}]."
            if counts and not members:
                answer += f" By option: {counts} [{label}]."
            incomplete = [c['field'] for c in data.get('comparisons', []) if c['status'] != 'verified']
            if incomplete:
                answer += f" Database comparison remains {data.get('status')}: {', '.join(incomplete[:4])} [{label}]."
            return answer
        return None

    @staticmethod
    def _asks_member_count(question: str) -> bool:
        return bool(re.search(r"\b(?:how many|number of|count).*\bmembers?\b.*\bassigned\b|\bassigned (?:members?|member count)\b", question, re.I))

    @staticmethod
    def _stored_member_answer(question: str, evidence: list[dict]) -> str | None:
        if not MultiAgentWorkflow._asks_member_count(question) or re.search(r"\b(why|compare|explain|risk)\b", question, re.I):
            return None
        for item in evidence:
            if item.get('tool') != 'get_proposal_voting_facts':
                continue
            facts = item.get('content', {}).get('facts', {})
            count = facts.get('stored_assigned_members')
            if count is not None:
                return f"DAO records show {count} member(s) currently assigned to this proposal [{item['source_id']}]. This is the stored assignment count, not an independent on-chain check."
        return None

    @staticmethod
    def _proposal_fact_answer(question: str, evidence: list[dict]) -> str | None:
        text = question.lower()
        asks_summary = bool(re.search(r"\b(summar(?:y|ize|ise)|overview)\b", text))
        asks_title = bool(re.search(r"\b(title|name)\b", text))
        asks_purpose = "purpose" in text or "goal" in text
        asks_description = "description" in text
        asks_external_evidence = bool(re.search(
            r"\b(pdf|document|attachment|evidence|source|citation|supporting)\b", text
        ))
        if not (asks_summary or asks_title or asks_purpose or asks_description):
            return None
        if asks_external_evidence:
            return None
        if asks_summary and re.search(r"\b(risks?|benefits?|recommend(?:ation)?s?|implications?)\b", text):
            return None

        source = next((item for item in evidence if item.get("tool") == "get_proposal"), None)
        if not source or not isinstance(source.get("content"), dict):
            return None
        data = source["content"]
        citation = f"[{source['source_id']}]"
        parts = []
        if asks_summary or asks_title:
            title = data.get("title")
            parts.append(f"Proposal title: {title}" if title else "The proposal record has no title")
        if asks_summary or asks_purpose:
            purpose = data.get("purpose")
            if purpose:
                parts.append(f"Purpose: {purpose}")
            elif asks_purpose or asks_summary:
                parts.append("The proposal record does not include a purpose")
        if asks_summary or asks_description:
            description = data.get("description")
            if description:
                parts.append(f"Description: {description}")
            elif asks_description or asks_summary:
                parts.append("The proposal record does not include a description")
        if not parts:
            return None
        return ". ".join(parts) + f". {citation}"

    @staticmethod
    def _stored_voting_answer(question: str, evidence: list[dict]) -> str | None:
        text = question.lower()
        asks_votes = bool(re.search(r"\b(votes?|voting|ballots?|active votes?)\b", text))
        asks_status = bool(re.search(r"\b(status|active|open|closed|ended|current)\b", text))
        if not asks_votes and not asks_status:
            return None

        facts_source = next((item for item in evidence
            if item.get("tool") == "get_proposal_voting_facts"), None)
        time_source = next((item for item in evidence
            if item.get("tool") == "get_proposal_time_window"), None)
        parts = []
        if asks_votes and facts_source:
            data = facts_source.get("content", {})
            facts = data.get("facts", data) if isinstance(data, dict) else {}
            total = facts.get("stored_total_votes")
            if total is not None:
                parts.append(f"The database records {total} vote(s) for this proposal")
                record_total = facts.get("proposal_record_total_votes")
                if record_total is not None and str(record_total) != str(total):
                    parts.append(
                        f"The proposal record's total_votes field is {record_total}, which differs from the count of stored vote rows"
                    )
                counts = facts.get("stored_votes_by_option_index") or []
                if re.search(r"\b(option|each|per choice|breakdown)\b", text) and counts:
                    breakdown = ", ".join(
                        f"option index {row.get('option_index')}: {row.get('vote_count')}"
                        for row in counts
                    )
                    parts.append(f"By option index: {breakdown}")
                elif re.search(r"\b(options?|per choice|breakdown)\b", text):
                    parts.append("No per-option vote rows are stored")
                parts.append("This is a stored database count, not an independently verified on-chain tally")
            else:
                parts.append("The vote count is not available in the stored proposal records")
            citation = f"[{facts_source['source_id']}]"
            if "active" in text:
                parts.append("The database does not keep a separate active-vote count")
            parts = [f"{part} {citation}" for part in parts]

        if asks_status and time_source:
            data = time_source.get("content", {})
            if isinstance(data, dict):
                status = data.get("stored_status")
                window = data.get("time_window_state")
                if status is not None:
                    parts.append(f"Stored proposal status: {status} [{time_source['source_id']}]")
                if window:
                    parts.append(f"Voting time window: {window} [{time_source['source_id']}]")
        return ". ".join(parts) + "." if parts else None

    @staticmethod
    def _research_count_answer(evidence: list[dict]) -> str | None:
        for item in evidence:
            if item.get('tool') in ('list_dao_proposals', 'search_dao_proposals'):
                rows = item.get('content', {}).get('proposals')
                if isinstance(rows, list):
                    cite = f"[{item['source_id']}]"
                    if not rows:
                        return f"No matching stored proposals were returned in the selected DAO. {cite}"
                    heading = "Matching proposals" if item['tool'] == 'search_dao_proposals' else "Stored proposals"
                    lines = [f"{heading} in the selected DAO (up to 20 results; this is not a total count): {cite}"]
                    lines.extend(f"- {r.get('title') or 'Untitled'} (ID: {r.get('id')}) {cite}" for r in rows)
                    return '\n'.join(lines)
            if item.get('tool') != 'count_dao_proposals':
                continue
            data = item.get('content', {})
            count = data.get('proposal_count')
            if isinstance(count, int) and not isinstance(count, bool) and count >= 0:
                return f"The selected DAO has {count} proposal(s) in the DAO database [{item['source_id']}]."
        return None

    async def _chat_with_fallback(self, question: str, context: str, model: str) -> tuple[str, float, dict]:
        telemetry = self._telemetry.get()
        async def generate(selected):
            before = sum(s['kind']=='llm' for s in telemetry.spans) if telemetry else 0
            started, timestamp = time.perf_counter(), utc_now()
            try:
                async with self._generation_lock:
                    result = await self.context.rag.ollama.chat(question, context, model=selected)
                # Alternate Ollama adapters may not expose per-request hooks.
                if telemetry and sum(s['kind']=='llm' for s in telemetry.spans) == before:
                    telemetry.llm(dict(name='ollama.chat', model=selected, attempt=1,
                        started_at=timestamp, completed_at=utc_now(), latency_ms=(time.perf_counter()-started)*1000,
                        status='completed', input_tokens=result[2].get('input_tokens'), output_tokens=result[2].get('output_tokens')))
                return result
            except BaseException as exc:
                if telemetry and sum(s['kind']=='llm' for s in telemetry.spans) == before:
                    telemetry.llm(dict(name='ollama.chat', model=selected, attempt=1, started_at=timestamp,
                        completed_at=utc_now(), latency_ms=(time.perf_counter()-started)*1000, status='failed', error_type=type(exc).__name__, input_tokens=None, output_tokens=None))
                raise
        try:
            return await generate(model)
        except Exception:
            if model != settings.ollama_chat_model:
                if telemetry:
                    fallback = telemetry.begin('retry', 'model_fallback', telemetry.route, from_model=model, to_model=settings.ollama_chat_model)
                    telemetry.end(fallback)
                return await generate(settings.ollama_chat_model)
            raise

    async def _verify(self, state: QuestionState) -> dict:
        if state.get("status") == "failed":
            return {}
        telemetry = self._telemetry.get()
        span = telemetry.begin('citation_check', 'verify_citations', 'supervisor') if telemetry else None
        result = await self.tools["verify_citations"].ainvoke({
            "answer": state.get("answer", ""), "evidence": state.get("evidence", [])})
        sources = [CitedSource(source_id=item['source_id'],
            content=item['content'] if isinstance(item['content'], str) else json.dumps(item['content'], default=str))
            for item in state.get('evidence', [])]
        if result['valid'] and not supported_amounts(state.get('answer', ''), sources, state['plan']['question']):
            result = {**result, 'valid': False}
        if telemetry and span: telemetry.end(span, 'completed' if result['valid'] else 'failed',
            citations=result['cited'], unknown=result['unknown'], error_type=None if result['valid'] else 'CitationVerificationError')
        if result["valid"]:
            return {"citations": result["cited"], "status": "completed"}
        error = "Citation verification failed"
        if result["unknown"]:
            error += ": " + ", ".join(result["unknown"])
        if state.get("attempts", 0) >= self.max_retries:
            return {"citations": result["cited"], "status": "failed", "failure_kind": "verification_failed",
                    "errors": [*state.get("errors", []), error]}
        allowed = sorted({item.get("source_id") for item in state.get("evidence", [])
                          if item.get("source_id")})
        repair_hint = f"Citations must come from: {', '.join(allowed)}. Monetary amounts must match source evidence; quote ambiguous user amounts only as a clarification. " + error
        return {"citations": result["cited"], "status": "retry",
                "errors": [*state.get("errors", []), repair_hint]}

    @staticmethod
    def _after_verify(state: QuestionState) -> str:
        return state["plan"]["agent"] if state.get("status") == "retry" else "end"

    async def _generation_model(self) -> str:
        if self._fast_model_available is None:
            async with self._model_lock:
                if self._fast_model_available is None:
                    try:
                        self._fast_model_available = await self.context.rag.ollama.has_model(
                            settings.ollama_fast_model)
                    except Exception:
                        self._fast_model_available = False
        return settings.ollama_fast_model if self._fast_model_available else settings.ollama_chat_model

    @staticmethod
    def _failed(plan: PlannedQuestion, error: str, total_ms: float = 0, kind: str = "execution_error") -> QuestionResult:
        return QuestionResult(question_id=plan.question_id, question=plan.question,
                              agent=plan.agent, status="failed", errors=[error],
                              total_ms=total_ms, execution={"failure_kind": kind})
