"""Authenticated LangGraph multi-agent endpoints with conversation persistence and streaming."""

import asyncio
import json
import time
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import ValidationError
from sse_starlette.sse import EventSourceResponse

from app.business.agents.domain_guard import classify_domain, conversational_reply
from app.business.agents.workflow import MultiAgentWorkflow
from app.business.agents.question_planner import (
    QuestionPlanningError,
    plan_question_batch,
)
from app.business.mcp.context import ExecutionContext
from app.business.rag.service import RagService
from app.model.database.conversations import (create_agent_run, create_conversation, delete_conversation, delete_conversations,
    create_message, create_question_results, complete_agent_run, get_conversation,
    get_messages, list_conversations, update_conversation_timestamp)
from app.model.database.interfaces import DatabasePool
from app.presentation.dependencies.identity import WalletIdentity, require_wallet_identity
from app.presentation.dependencies.services import get_database_pool, get_rag_service
from app.presentation.schemas.rag import (AgentAskRequest, ConversationCreate,
    ConversationResponse, MessageResponse)
from app.model.database.agent_observability import executions
from .metrics import record_operation
from app.business.agents.models import AgentRunResponse

router = APIRouter()
# Workflows use server-side read tools after delegation and scope verification.
# The internal operator capability is never derived from a wallet/header role.
CLARIFY_REQUEST = "What would you like me to check about this proposal? I can explain its documents, summarize votes, or compare the records with CyberChain."


async def save_reply(pool, conversation_id: UUID, message: str, reply: str) -> AgentRunResponse:
    await create_message(pool, conversation_id, "user", message)
    await create_message(pool, conversation_id, "assistant", reply)
    await update_conversation_timestamp(pool, conversation_id)
    return AgentRunResponse(conversation_id=conversation_id, run_id=None,
                            status="completed", results=[], reply=reply)


def stream_reply(response: AgentRunResponse) -> EventSourceResponse:
    async def events():
        yield {"event": "run_complete", "data": response.model_dump_json(exclude_none=True)}
    return EventSourceResponse(events())


@router.post("/agents/ask", response_model=AgentRunResponse)
async def ask_agents(body: AgentAskRequest,
                     identity: WalletIdentity = Depends(require_wallet_identity),
                     pool: DatabasePool = Depends(get_database_pool),
                     rag: RagService = Depends(get_rag_service)):
    """Non-streaming multi-agent question answering with conversation persistence."""
    start_time = time.time()
    
    
    identity.require_scope(body.dao_id, body.proposal_id)
    # Handle conversation
    conversation_id = body.conversation_id
    if conversation_id:
        conversation = await get_conversation(pool, conversation_id, owner_id=identity.owner)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conversation.dao_id != body.dao_id:
            raise HTTPException(status_code=403, detail="Conversation belongs to different DAO")
        if conversation.proposal_id != body.proposal_id:
            raise HTTPException(status_code=403, detail="Conversation belongs to different proposal")
    else:
        # Create new conversation
        conversation = await create_conversation(pool, body.dao_id, body.proposal_id, body.title, owner_id=identity.owner)
        conversation_id = conversation.id
    
    original_questions = [body.question] if isinstance(body.question, str) else body.question
    original_message = "\n".join(original_questions)
    reply = conversational_reply(original_message)
    if reply:
        return await save_reply(pool, conversation_id, original_message, reply)

    # Get conversation history for context
    history = await get_messages(pool, conversation_id, limit=20)
    history_context = [{"role": m.role, "content": m.content} for m in history]
    
    decision = classify_domain(original_message, history_context)
    if decision.label == "out_of_scope":
        return await save_reply(pool, conversation_id, original_message, decision.message)
    planning_input = decision.in_scope_text if decision.label == "mixed" else body.question
    try:
        plan = await plan_question_batch(rag.ollama, planning_input, context=history_context)
    except QuestionPlanningError as exc:
        if isinstance(exc.__cause__, ValidationError) and decision.label == "uncertain":
            return await save_reply(pool, conversation_id, original_message, CLARIFY_REQUEST)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if plan.needs_clarification:
        raise HTTPException(status_code=422, detail=plan.clarification)

    questions_list = [item.question for item in plan.questions]
    user_msg = await create_message(pool, conversation_id, "user", "\n".join(original_questions),
                                    question_ids=[f"q{i+1}" for i in range(len(questions_list))])
    
    run_id = uuid4()
    workflow = MultiAgentWorkflow(ExecutionContext(pool, rag, operator_verified=True),
                                  concurrency=body.concurrency)
    
    # Create agent run record
    agent_run = await create_agent_run(pool, conversation_id, user_msg.id,
                                       [{"question_id": f"q{i+1}", "question": q} 
                                        for i, q in enumerate(questions_list)])
    
    run_id = agent_run.id
    try:
        result = await workflow.run(
            questions_list, dao_id=body.dao_id, proposal_id=body.proposal_id,
            top_k=body.top_k, conversation_history=history_context,
            question_plan=plan.questions,
            run_id=run_id, conversation_id=conversation_id,
            original_request=decision.in_scope_text if decision.label == "mixed" else original_message,
        )
        
        domain_note = decision.message if decision.label == "mixed" else ""
        if domain_note and result.final_response:
            result.final_response.answer = f"{result.final_response.answer or ''}\n\n{domain_note}".strip()

        # Persist results
        results_data = [r.model_dump(mode="json") for r in result.results]
        await create_question_results(pool, agent_run.id, results_data)
        await complete_agent_run(pool, agent_run.id, result.status, results_data,
                                 (time.time() - start_time) * 1000, sum(r.tool_calls for r in result.results))
        
        # Store assistant message
        assistant_content = result.final_response.answer if result.final_response else "\n\n".join(
            f"Q: {r.question}\nA: {r.answer or 'Failed: ' + '; '.join(r.errors)}"
            for r in result.results
        )
        await create_message(pool, conversation_id, "assistant", assistant_content,
                             question_ids=[r.question_id for r in result.results],
                             metadata={"run_id": str(run_id), "status": result.status,
                                "results": [result.final_response.model_dump(mode="json")] if result.final_response else results_data,
                                "worker_results": results_data})
        
        await update_conversation_timestamp(pool, conversation_id)
        
        record_operation("agents-ask", (time.time() - start_time) * 1000)
        response = result.model_dump(mode="json")
        response["conversation_id"] = str(conversation_id)
        response["run_id"] = str(run_id)
        return response
        
    except Exception as exc:
        await complete_agent_run(pool, agent_run.id, "failed", [],
                                 (time.time() - start_time) * 1000, 0, str(exc))
        raise


@router.post("/agents/ask/stream")
async def ask_agents_stream(request: Request, body: AgentAskRequest,
                            identity: WalletIdentity = Depends(require_wallet_identity),
                     pool: DatabasePool = Depends(get_database_pool),
                            rag: RagService = Depends(get_rag_service)):
    """Streaming multi-agent question answering with SSE."""
    
    identity.require_scope(body.dao_id, body.proposal_id)
    # Handle conversation
    conversation_id = body.conversation_id
    if conversation_id:
        conversation = await get_conversation(pool, conversation_id, owner_id=identity.owner)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conversation.dao_id != body.dao_id:
            raise HTTPException(status_code=403, detail="Conversation belongs to different DAO")
        if conversation.proposal_id != body.proposal_id:
            raise HTTPException(status_code=403, detail="Conversation belongs to different proposal")
    else:
        conversation = await create_conversation(pool, body.dao_id, body.proposal_id, body.title, owner_id=identity.owner)
        conversation_id = conversation.id
    
    original_questions = [body.question] if isinstance(body.question, str) else body.question
    original_message = "\n".join(original_questions)
    reply = conversational_reply(original_message)
    if reply:
        return stream_reply(await save_reply(pool, conversation_id, original_message, reply))

    history = await get_messages(pool, conversation_id, limit=20)
    history_context = [{"role": m.role, "content": m.content} for m in history]

    # Domain Guard: reject clearly unrelated requests before any LLM or agent call.
    decision = classify_domain(original_message, history_context)
    if decision.label == "out_of_scope":
        await create_message(pool, conversation_id, "user", original_message)
        await create_message(pool, conversation_id, "assistant", decision.message,
                             metadata={"domain_guard": "out_of_scope"})
        await update_conversation_timestamp(pool, conversation_id)

        async def refusal_events():
            yield {"event": "question_plan", "data": json.dumps({
                "conversation_id": str(conversation_id),
                "data": {"questions": [], "needs_clarification": True, "clarification": decision.message},
            })}
            yield {"event": "run_complete", "data": json.dumps({
                "conversation_id": str(conversation_id), "status": "needs_clarification",
                "domain": "out_of_scope", "clarification": decision.message, "results": [],
            })}

        return EventSourceResponse(refusal_events(), ping=15,
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    # Mixed request: plan only the CyberChain part and append a note declining the rest.
    domain_note = decision.message if decision.label == "mixed" else ""
    planning_input = decision.in_scope_text if decision.label == "mixed" else body.question
    try:
        plan = await plan_question_batch(rag.ollama, planning_input, context=history_context)
    except QuestionPlanningError as exc:
        if isinstance(exc.__cause__, ValidationError) and decision.label == "uncertain":
            return stream_reply(await save_reply(pool, conversation_id, original_message, CLARIFY_REQUEST))
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if plan.needs_clarification:
        await create_message(pool, conversation_id, "user", original_message)
        await create_message(pool, conversation_id, "assistant", plan.clarification or "Please clarify your request.",
                             metadata={"question_planner": "clarification"})
        await update_conversation_timestamp(pool, conversation_id)

        async def clarification_events():
            yield {"event": "question_plan", "data": json.dumps({
                "conversation_id": str(conversation_id),
                "data": {
                    "questions": [item.question for item in plan.questions],
                    "needs_clarification": True,
                    "clarification": plan.clarification,
                },
            })}
            yield {"event": "run_complete", "data": json.dumps({
                "conversation_id": str(conversation_id),
                "status": "needs_clarification", "results": [],
                "clarification": plan.clarification,
            })}

        return EventSourceResponse(clarification_events(), ping=15,
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    questions_list = [item.question for item in plan.questions]
    user_msg = await create_message(pool, conversation_id, "user", original_message,
                                    question_ids=[f"q{i+1}" for i in range(len(questions_list))])
    run_id = uuid4()
    workflow = MultiAgentWorkflow(ExecutionContext(pool, rag, operator_verified=True),
                                  concurrency=body.concurrency)
    
    # Create agent run record
    agent_run = await create_agent_run(pool, conversation_id, user_msg.id,
                                       [{"question_id": f"q{i+1}", "question": q} 
                                        for i, q in enumerate(questions_list)])
    
    run_id = agent_run.id
    # A single producer queues real workflow events; the consumer drains until a sentinel.
    # Terminal completion is emitted only after persistence, and includes ordered results.
    queue = asyncio.Queue()
    queue.put_nowait({"event": "question_plan", "data": json.dumps({
        "conversation_id": str(conversation_id),
        "data": {
            "questions": questions_list,
            "needs_clarification": False,
        },
    })})

    async def produce():
        started = time.time()
        try:
            def progress(event):
                if event.event != "run_complete":
                    queue.put_nowait({"event": event.event, "data": event.model_dump_json()})

            result = await workflow.run(
                questions_list, dao_id=body.dao_id, proposal_id=body.proposal_id,
                top_k=body.top_k, conversation_history=history_context,
                question_plan=plan.questions,
                stream_callback=progress, run_id=run_id, conversation_id=conversation_id,
                original_request=decision.in_scope_text if decision.label == "mixed" else original_message)
            if domain_note and result.final_response:
                result.final_response.answer = f"{result.final_response.answer or ''}\n\n{domain_note}".strip()
            results = [r.model_dump(mode="json") for r in result.results]
            await create_question_results(pool, agent_run.id, results)
            await complete_agent_run(pool, agent_run.id, result.status, results,
                                     (time.time() - started) * 1000,
                                     sum(r.tool_calls for r in result.results))
            await create_message(pool, conversation_id, "assistant",
                result.final_response.answer if result.final_response else "\n\n".join(f"Q: {r.question}\nA: {r.answer or '; '.join(r.errors)}" for r in result.results) + (f"\n\n{domain_note}" if domain_note else ""),
                question_ids=[r.question_id for r in result.results],
                metadata={"run_id": str(run_id), "status": result.status,
                    "results": [result.final_response.model_dump(mode="json")] if result.final_response else results,
                    "worker_results": results, "metrics": result.metrics, "domain": decision.label})
            await update_conversation_timestamp(pool, conversation_id)
            queue.put_nowait({"event": "run_complete", "data": json.dumps({
                "run_id": str(run_id), "conversation_id": str(conversation_id),
                "status": result.status, "results": results,
                "domain": decision.label, "domain_notice": domain_note or None,
                "final_response": result.final_response.model_dump(mode="json") if result.final_response else None,
                "total_ms": (time.time() - started) * 1000, "metrics": result.metrics, "trace": result.trace})})
        except asyncio.CancelledError:
            # Client disconnected: keep every finding that completed before the cancellation.
            partial = [r.model_dump(mode="json") for r in workflow.partial_results()]
            await complete_agent_run(pool, agent_run.id, "cancelled", partial,
                                     (time.time() - started) * 1000, 0, "Client disconnected")
            raise
        except Exception:
            try:
                await complete_agent_run(pool, agent_run.id, "failed", [],
                                         (time.time() - started) * 1000, 0, "Agent execution failed")
            except Exception:
                pass  # Report the failure even if the database is unavailable.
            queue.put_nowait({"event": "run_error", "data": json.dumps({
                "conversation_id": str(conversation_id),
                "error": "AI execution or persistence failed. Check AI server availability and Ollama models."})})
        finally:
            queue.put_nowait(None)

    async def events():
        task = asyncio.create_task(produce())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    return EventSourceResponse(events(), ping=15, headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def scoped_conversation(pool, conversation_id: UUID, identity: WalletIdentity):
    conversation = await get_conversation(pool, conversation_id, owner_id=identity.owner)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    identity.require_scope(conversation.dao_id, conversation.proposal_id)
    return conversation


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation_endpoint(body: ConversationCreate,
                                        identity: WalletIdentity = Depends(require_wallet_identity),
                                        pool: DatabasePool = Depends(get_database_pool)):
    """Create a new conversation."""
    identity.require_scope(body.dao_id, body.proposal_id)
    conversation = await create_conversation(pool, body.dao_id, body.proposal_id, body.title, owner_id=identity.owner)
    return ConversationResponse(
        id=conversation.id, dao_id=conversation.dao_id,
        proposal_id=conversation.proposal_id, title=conversation.title,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat()
    )


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations_endpoint(dao_id: str, limit: int = Query(default=20, ge=1, le=100), proposal_id: str | None = None,
                                       identity: WalletIdentity = Depends(require_wallet_identity),
                                        pool: DatabasePool = Depends(get_database_pool)):
    """List conversations for a DAO."""
    identity.require_scope(dao_id, proposal_id)
    conversations = await list_conversations(pool, dao_id, limit, owner_id=identity.owner, proposal_id=proposal_id)
    return [ConversationResponse(
        id=c.id, dao_id=c.dao_id, proposal_id=c.proposal_id, title=c.title,
        created_at=c.created_at.isoformat(), updated_at=c.updated_at.isoformat()
    ) for c in conversations]


@router.delete("/conversations")
async def delete_conversations_endpoint(
    dao_id: str,
    proposal_id: str,
    identity: WalletIdentity = Depends(require_wallet_identity),
    pool: DatabasePool = Depends(get_database_pool),
):
    """Permanently delete all conversations in the owner's proposal scope."""
    identity.require_scope(dao_id, proposal_id)
    deleted = await delete_conversations(
        pool, dao_id, proposal_id, owner_id=identity.owner
    )
    return {"deleted": True, "deleted_count": deleted}


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation_endpoint(conversation_id: UUID,
                                     identity: WalletIdentity = Depends(require_wallet_identity),
                                        pool: DatabasePool = Depends(get_database_pool)):
    """Get a conversation by ID."""
    conversation = await scoped_conversation(pool, conversation_id, identity)
    return ConversationResponse(
        id=conversation.id, dao_id=conversation.dao_id,
        proposal_id=conversation.proposal_id, title=conversation.title,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat()
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation_endpoint(
    conversation_id: UUID,
    identity: WalletIdentity = Depends(require_wallet_identity),
    pool: DatabasePool = Depends(get_database_pool),
):
    """Permanently delete an owner's conversation and all related history."""
    await scoped_conversation(pool, conversation_id, identity)
    if not await delete_conversation(pool, conversation_id, owner_id=identity.owner):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_conversation_messages(conversation_id: UUID, limit: int = Query(default=50, ge=1, le=100),
                                     identity: WalletIdentity = Depends(require_wallet_identity),
                                        pool: DatabasePool = Depends(get_database_pool)):
    """Get messages for a conversation."""
    await scoped_conversation(pool, conversation_id, identity)
    messages = await get_messages(pool, conversation_id, limit)
    return [MessageResponse(
        id=m.id, conversation_id=m.conversation_id, role=m.role, content=m.content,
        question_ids=m.question_ids, metadata=m.metadata,
        created_at=m.created_at.isoformat()
    ) for m in messages]


@router.get('/agents/runs')
async def list_execution_runs(dao_id: str, proposal_id: str, limit: int = Query(default=100, ge=1, le=500),
        identity: WalletIdentity = Depends(require_wallet_identity), pool=Depends(get_database_pool)):
    identity.require_scope(dao_id, proposal_id)
    return await executions(pool, identity.owner, dao_id, proposal_id, limit=limit)


@router.get('/agents/runs/{run_id}')
async def get_execution_run(run_id: UUID, dao_id: str, proposal_id: str,
        identity: WalletIdentity = Depends(require_wallet_identity), pool=Depends(get_database_pool)):
    identity.require_scope(dao_id, proposal_id)
    rows = await executions(pool, identity.owner, dao_id, proposal_id, run_id)
    if not rows:
        raise HTTPException(status_code=404, detail='Execution not found')
    return rows[0]
