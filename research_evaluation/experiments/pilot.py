"""Run from the AI repository with its venv. All direct DB sessions are read-only."""
import argparse
import asyncio
import hashlib
import json
import platform
import random
import re
import subprocess
import time
from pathlib import Path
from importlib.metadata import version

import httpx
from psycopg_pool import AsyncConnectionPool
from app.business.agents.models import QuestionPlanItem
from app.business.agents.question_planner import plan_question_batch
from app.business.agents.quality import verify_citations
from app.business.agents.workflow import MultiAgentWorkflow
from app.business.evaluation.experiments import single_llm
from app.business.mcp.context import ExecutionContext
from app.business.rag.service import RagService
from app.model.config.settings import settings

ROOT = Path(__file__).resolve().parents[1]
MODES = ["llm_only", "single_evidence_worker", "worker_gate_off", "full"]


class WorkerGateOff(MultiAgentWorkflow):
    """Remove specialist verification/repair only. Final synthesis gates remain enabled."""
    async def _verify(self, state):
        if state.get("status") == "failed":
            return {}
        refs = verify_citations(state.get("answer") or "", state.get("evidence", []))["cited"]
        return {"citations": refs, "status": "completed"}


def scrub(value):
    """Only export selected demo scope and redact wallet/transaction values and URLs."""
    if isinstance(value, str):
        return re.sub(r"(?i)https?://\S+|0x[0-9a-f]{40,}", "[redacted]", value)
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items()}
    return value


async def run(case, mode, rag, pool):
    start = time.perf_counter()
    plan_ms, intents, spans, result = None, [], [], None
    metrics, phase, error = {}, "generation", None
    try:
        async with asyncio.timeout(200):
            if mode == "llm_only":
                result = await single_llm(case["question"], rag)
                spans = result.execution.get("trace", [])
                metrics = result.execution
            else:
                phase = "planning"
                t = time.perf_counter()
                if mode in ("single_evidence_worker", "direct_specialist"):
                    specs = [QuestionPlanItem(question=case["question"],
                                              intent="evidence" if mode == "single_evidence_worker" else case["intent"])]
                else:
                    plan = await plan_question_batch(rag.ollama, case["question"])
                    if plan.needs_clarification:
                        raise ValueError("Planner requested clarification")
                    specs = plan.questions
                plan_ms = (time.perf_counter() - t) * 1000
                intents = [item.intent for item in specs]
                phase = "workflow"
                cls = WorkerGateOff if mode == "worker_gate_off" else MultiAgentWorkflow
                output = await cls(ExecutionContext(pool, rag, True), concurrency=1).run(
                    [item.question for item in specs], question_plan=specs,
                    dao_id=case["dao"], proposal_id=case["proposal"], top_k=4,
                    original_request=None if mode == "direct_specialist" else case["question"],
                )
                result, spans, metrics = (output.results[0] if mode == "direct_specialist" else output.final_response), output.trace, output.metrics
                metrics = {**metrics, "workflow_status": output.status}
    except Exception as exc:
        error = type(exc).__name__
    status = "completed" if result and result.status == "completed" and not error else "failed"
    data = result.model_dump(mode="json") if result else {}
    return scrub({"case": case["id"], "mode": mode, "status": status,
                  "phase": phase, "error": error, "wall_ms": (time.perf_counter()-start)*1000,
                  "planning_ms": plan_ms, "intents": intents, "answer": data.get("answer"),
                  "citations": data.get("citations", []),
                  "sources": [{k: s[k] for k in ("source_id", "content")}
                              for s in data.get("cited_sources", [])],
                  "warnings": data.get("errors", []), "spans": spans,
                  "metrics": {k: metrics.get(k) for k in
                              ("input_tokens", "output_tokens", "embedding_tokens", "retrieval_ms",
                               "tool_calls", "llm_ms", "workflow_status", "progressive")}})


async def main(args):
    dataset = (ROOT / "datasets/pilot.json").read_bytes()
    cases = json.loads(dataset)
    if args.cases:
        cases = [case for case in cases if case["id"] in args.cases]
        if len(cases) != len(set(args.cases)):
            raise ValueError("Unknown pilot case")
    output = ROOT / "raw_results" / args.label
    output.mkdir(exist_ok=False)
    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        models = (await client.get(settings.ollama_base_url + "/api/tags")).raise_for_status().json()
        runtime = (await client.get(settings.ollama_base_url + "/api/version")).raise_for_status().json()
    manifest = {"revision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
                "dataset_sha256": hashlib.sha256(dataset).hexdigest(),
                "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "os": platform.platform(), "python": platform.python_version(),
                "packages": {p: version(p) for p in ("langgraph", "langchain-core", "psycopg", "httpx")},
                "ollama": runtime, "models": models,
                "configured_models": [settings.ollama_chat_model, settings.ollama_fast_model, settings.ollama_embed_model],
                "repeats": args.repeats, "modes": args.modes, "cases": [c["id"] for c in cases], "seed_order": 42,
                "concurrency": 1, "top_k": 4, "timeout_seconds": 200,
                "timing_scope": "Python in-process, no HTTP/browser or persistence. Direct specialist mode uses a supplied plan and returns the worker answer without synthesis."}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
    pool = AsyncConnectionPool(settings.postgres_url, kwargs={"options": "-c default_transaction_read_only=on"},
                               min_size=1, max_size=4, open=False)
    await pool.open(wait=True, timeout=8)
    try:
        async with pool.connection() as conn:
            row = await (await conn.execute("SHOW transaction_read_only")).fetchone()
            assert row == ("on",)
        rag = RagService(pool)
        order = random.Random(42)
        with (output / "runs.jsonl").open("x", encoding="utf8") as file:
            for rep in range(args.repeats):
                for case in cases:
                    modes = list(args.modes)
                    order.shuffle(modes)
                    for mode in modes:
                        value = {"repeat": rep + 1, **await run(case, mode, rag, pool)}
                        file.write(json.dumps(value, ensure_ascii=False) + "\n")
                        file.flush()
                        print(case["id"], mode, rep + 1, value["status"], round(value["wall_ms"]), flush=True)
    finally:
        await pool.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--modes", nargs="+", choices=MODES + ["direct_specialist"], default=MODES)
    parser.add_argument("--cases", nargs="+")
    asyncio.run(main(parser.parse_args()), loop_factory=asyncio.SelectorEventLoop if platform.system() == "Windows" else asyncio.new_event_loop)
