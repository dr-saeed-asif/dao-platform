"""Persistence and read-only inspection for evaluation runs."""

from app.model.entities.evaluation import RunMetrics


async def insert_run(pool, metrics: RunMetrics) -> None:
    query = """INSERT INTO ai.evaluation_runs
        (run_id, system_type, system_version, selected_model, embedding_profile,
        dao_id, proposal_id, retrieval_ms, generation_ms, total_ms,
        embedding_tokens, input_tokens, output_tokens, tool_calls, source_ids,
        citation_count, completion_status, error_type)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
    values = tuple(list(value) if field == "source_ids" else value
                   for field in _FIELDS
                   for value in (getattr(metrics, field),))
    async with pool.connection(timeout=5) as conn:
        await conn.execute(query, values)


_FIELDS = ("run_id", "system_type", "system_version", "selected_model",
    "embedding_profile", "dao_id", "proposal_id", "retrieval_ms",
    "generation_ms", "total_ms", "embedding_tokens", "input_tokens",
    "output_tokens", "tool_calls", "source_ids", "citation_count",
    "completion_status", "error_type")


async def list_runs(pool, limit: int = 20) -> list[dict]:
    query = """SELECT run_id, system_type, system_version, selected_model,
        embedding_profile, dao_id, proposal_id, total_ms, tool_calls,
        source_ids, citation_count, completion_status, error_type, created_at
        FROM ai.evaluation_runs ORDER BY created_at DESC LIMIT %s"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (limit,))
            rows = await cur.fetchall()
    return [dict(zip(_LIST_FIELDS, row)) for row in rows]


_LIST_FIELDS = ("run_id", "system_type", "system_version", "selected_model",
    "embedding_profile", "dao_id", "proposal_id", "total_ms", "tool_calls",
    "source_ids", "citation_count", "completion_status", "error_type", "created_at")
