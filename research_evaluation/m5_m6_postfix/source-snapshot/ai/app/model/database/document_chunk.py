"""Read one chunk from explicitly selected proposal-scoped indexes."""

from psycopg_pool import AsyncConnectionPool


async def chunk_for_indexes(pool: AsyncConnectionPool, index_ids: list[int],
                            chunk_key: str) -> dict | None:
    if not index_ids:
        return None
    query = """SELECT c.chunk_key, c.page_number, c.chunk_index, c.content
        FROM ai.indexed_chunks AS c
        JOIN ai.document_indexes i ON i.id=c.document_index_id AND i.status='READY'
        WHERE c.document_index_id = ANY(%s::bigint[]) AND c.chunk_key = %s
        ORDER BY c.document_index_id LIMIT 1"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(query, (index_ids, chunk_key))
            row = await cursor.fetchone()
    if row is None:
        return None
    return dict(zip(("chunk_key", "page_number", "chunk_index", "content"), row, strict=True))
