"""pgvector retrieval constrained to selected proposal index IDs."""

from psycopg_pool import AsyncConnectionPool


async def search_proposal_chunks(pool: AsyncConnectionPool, index_ids: list[int],
                                 vector: list[float], top_k: int,
                                 cover_each_index: bool = False) -> list[tuple]:
    literal = "[" + ",".join(str(value) for value in vector) + "]"
    if cover_each_index:
        if len(index_ids) > 50:
            raise ValueError("Proposal has too many indexed PDFs for complete deadline search.")
        query = """WITH ranked AS (
        SELECT document_index_id, chunk_key, page_number, chunk_index, content,
            1 - (embedding <=> %s::public.vector) AS score,
            row_number() OVER (PARTITION BY document_index_id
                ORDER BY embedding <=> %s::public.vector) AS document_rank
        FROM ai.indexed_chunks WHERE document_index_id = ANY(%s::bigint[])
        AND document_index_id IN (SELECT id FROM ai.document_indexes WHERE status='READY')
        AND embedding_dimension = 1024)
        SELECT document_index_id, chunk_key, page_number, chunk_index, content, score
        FROM ranked WHERE document_rank <= %s
        ORDER BY score DESC LIMIT %s"""
        params = (literal, literal, index_ids, top_k, len(index_ids) * top_k)
    else:
        query = """SELECT document_index_id, chunk_key, page_number, chunk_index,
        content, 1 - (embedding <=> %s::public.vector) AS score
        FROM ai.indexed_chunks WHERE document_index_id = ANY(%s::bigint[])
        AND document_index_id IN (SELECT id FROM ai.document_indexes WHERE status='READY')
        AND embedding_dimension = 1024 ORDER BY embedding <=> %s::public.vector
        LIMIT %s"""
        params = (literal, index_ids, literal, top_k)
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchall()
