"""pgvector retrieval adapter for one document index."""

from psycopg_pool import AsyncConnectionPool
from app.model.entities.evidence import Evidence


async def search_chunks(pool: AsyncConnectionPool, index_id: int,
                        vector: list[float], top_k: int) -> list[dict]:
    if len(vector) != 1024:
        raise ValueError("Query embedding dimensions do not match the index.")
    literal = "[" + ",".join(str(value) for value in vector) + "]"
    query = """SELECT chunk_key, page_number, chunk_index, content,
        1 - (embedding <=> %s::public.vector) AS score FROM ai.indexed_chunks
        WHERE document_index_id=%s AND embedding_dimension=1024
        ORDER BY embedding <=> %s::public.vector LIMIT %s"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (literal, index_id, literal, top_k))
            rows = await cur.fetchall()
    return [Evidence(f"D{n}", row[3], score=round(float(row[4]), 4),
        metadata={"chunk_key": row[0], "page_number": row[1],
                  "chunk_index": row[2]}).as_dict() for n, row in enumerate(rows, 1)]
