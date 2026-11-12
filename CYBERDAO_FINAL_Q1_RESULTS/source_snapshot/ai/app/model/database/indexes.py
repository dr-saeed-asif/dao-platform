"""Queries for existing and currently compatible document indexes."""

from psycopg_pool import AsyncConnectionPool

from app.model.config.settings import settings


async def existing_keys(pool: AsyncConnectionPool, digest: str,
                        profile_id: str) -> list[tuple]:
    query = """SELECT i.status, c.chunk_key FROM ai.document_indexes i
        JOIN ai.documents d ON d.id = i.document_id
        LEFT JOIN ai.indexed_chunks c ON c.document_index_id = i.id
        WHERE d.sha256 = %s AND i.profile_id = %s
        ORDER BY c.page_number, c.chunk_index"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (digest, profile_id))
            return await cur.fetchall()


async def ready_index(pool: AsyncConnectionPool, digest: str,
                      model_digest: str) -> tuple[int, str]:
    query = """SELECT i.id, i.profile_id FROM ai.document_indexes i
        JOIN ai.documents d ON d.id=i.document_id
        JOIN ai.embedding_profiles p ON p.id=i.profile_id
        WHERE d.sha256=%s AND i.status='READY' AND p.provider='ollama'
        AND p.model=%s AND p.model_identity=%s AND p.dimensions=1024
        ORDER BY i.completed_at DESC, i.id DESC LIMIT 1"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (digest, settings.ollama_embed_model, model_digest))
            row = await cur.fetchone()
    if row is None:
        raise ValueError("No READY index for this PDF and installed embedding-model digest. "
                         "Index the PDF with the current model first.")
    return int(row[0]), row[1]
