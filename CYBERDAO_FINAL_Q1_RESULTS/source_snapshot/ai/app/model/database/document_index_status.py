"""Read status and counts for AI indexes matching a verified document hash."""

from psycopg_pool import AsyncConnectionPool


async def indexes_for_hash(pool: AsyncConnectionPool, sha256: str) -> list[dict]:
    query = """SELECT i.id, i.profile_id, i.status, i.started_at, i.completed_at,
        p.model, p.dimensions, COUNT(c.id)
        FROM ai.documents AS d JOIN ai.document_indexes AS i ON i.document_id = d.id
        JOIN ai.embedding_profiles AS p ON p.id = i.profile_id
        LEFT JOIN ai.indexed_chunks AS c ON c.document_index_id = i.id
        WHERE d.sha256 = %s
        GROUP BY i.id, i.profile_id, i.status, i.started_at, i.completed_at,
            p.model, p.dimensions ORDER BY i.id"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(query, (sha256,))
            rows = await cursor.fetchall()
    return [_index(row) for row in rows]


def _index(row: tuple) -> dict:
    return dict(zip(("index_id", "profile_id", "status", "started_at", "completed_at",
                     "model", "dimensions", "chunk_count"), row, strict=True))
