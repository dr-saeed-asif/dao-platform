"""Build safe metrics from existing workflow result structures."""

import re
from time import perf_counter
from uuid import uuid4

from app.model.config.settings import settings
from app.model.entities.evaluation import RunMetrics

SYSTEM_VERSION = "1"


def from_result(result: dict, tool_calls: int = 0) -> RunMetrics:
    scope, retrieval = result.get("scope", {}), result.get("retrieval", {})
    evidence, tokens = result.get("evidence", []), result.get("tokens", {})
    ids = tuple(dict.fromkeys(str(item["source_id"]) for item in evidence if item.get("source_id")))
    citations = len(re.findall(r"\[(?:D|G)\d+\]", result.get("answer", "")))
    return RunMetrics(run_id=result["runId"], system_type=result["system"],
        system_version=SYSTEM_VERSION, selected_model=settings.ollama_chat_model,
        embedding_profile=retrieval.get("profile_id"), dao_id=scope.get("dao_id"),
        proposal_id=scope.get("proposal_id"), retrieval_ms=result.get("retrievalLatencyMs", 0),
        generation_ms=result.get("generationLatencyMs", 0), total_ms=result.get("latencyMs", 0),
        embedding_tokens=result.get("_embedding_tokens"), input_tokens=tokens.get("input_tokens"),
        output_tokens=tokens.get("output_tokens"), tool_calls=tool_calls, source_ids=ids,
        citation_count=citations, completion_status="completed")


def from_search(result: dict, dao_id: str, proposal_id: str,
                tool_calls: int = 1,
                system_type: str = "mcp-proposal-search") -> RunMetrics:
    ids = tuple(dict.fromkeys(item["source_id"] for item in result.get("evidence", [])
                              if item.get("source_id")))
    elapsed = result.get("retrieval_ms", 0)
    return RunMetrics(str(uuid4()), system_type, SYSTEM_VERSION,
        settings.ollama_embed_model, result.get("profile_id"), dao_id, proposal_id,
        elapsed, 0, elapsed, result.get("embedding_tokens"), None, None,
        tool_calls, ids, 0, "completed")


def from_tool(tool_name: str, dao_id: str, proposal_id: str,
              elapsed_ms: float, source_ids: tuple[str, ...] = ()) -> RunMetrics:
    return RunMetrics(str(uuid4()), f"mcp:{tool_name}", SYSTEM_VERSION,
        "none", None, dao_id, proposal_id, elapsed_ms, 0, elapsed_ms,
        None, None, None, 1, source_ids, 0, "completed")


def failed(system_type: str, error: Exception, started: float, dao_id=None,
           proposal_id=None, tool_calls: int = 0) -> RunMetrics:
    return RunMetrics(str(uuid4()), system_type, SYSTEM_VERSION, settings.ollama_chat_model,
        None, dao_id, proposal_id, 0, 0, round((perf_counter() - started) * 1000, 1),
        None, None, None, tool_calls, (), 0,
        "failed", type(error).__name__)
