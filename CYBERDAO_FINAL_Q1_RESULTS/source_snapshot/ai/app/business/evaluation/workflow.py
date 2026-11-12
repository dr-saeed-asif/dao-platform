"""Apply shared recording to an answer-producing workflow."""

from time import perf_counter
from typing import Awaitable

from .metrics import failed, from_result, from_search, from_tool
from .recorder import RunRecorder


async def record_answer(recorder: RunRecorder, operation: Awaitable[dict], system_type: str,
                        dao_id=None, proposal_id=None, tool_calls: int = 0) -> dict:
    started = perf_counter()
    try:
        result = await operation
    except Exception as exc:
        await recorder.record(failed(system_type, exc, started, dao_id, proposal_id))
        raise
    metrics = from_result(result, tool_calls)
    result.pop("_embedding_tokens", None)
    await recorder.record(metrics)
    return result


async def record_search(recorder: RunRecorder, operation: Awaitable[dict],
                        dao_id: str, proposal_id: str) -> dict:
    started = perf_counter()
    try:
        result = await operation
    except Exception as exc:
        await recorder.record(failed("mcp:search_proposal_evidence", exc, started,
                                      dao_id, proposal_id, tool_calls=1))
        raise
    await recorder.record(from_search(result, dao_id, proposal_id,
                                       system_type="mcp:search_proposal_evidence"))
    return result


async def record_tool(recorder: RunRecorder, operation: Awaitable, tool_name: str,
                      dao_id: str, proposal_id: str | None):
    started = perf_counter()
    try:
        result = await operation
    except Exception as exc:
        await recorder.record(failed(f"mcp:{tool_name}", exc, started,
                                     dao_id, proposal_id, tool_calls=1))
        raise
    elapsed = round((perf_counter() - started) * 1000, 1)
    await recorder.record(from_tool(tool_name, dao_id, proposal_id, elapsed,
                                     _source_ids(result)))
    return result


def _source_ids(result) -> tuple[str, ...]:
    if not isinstance(result, dict):
        return ()
    direct = [result["evidence_id"]] if result.get("evidence_id") else []
    nested = [row["evidence_id"] for row in result.get("documents", [])
              if row.get("evidence_id")]
    return tuple(dict.fromkeys((*direct, *nested)))
