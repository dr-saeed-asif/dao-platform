"""Find READY AI indexes matching authoritative PDF and model identities."""

from psycopg_pool import AsyncConnectionPool


async def ready_proposal_indexes(pool: AsyncConnectionPool, hashes: list[str],
                                 model: str, digest: str) -> list[tuple]:
    query = """SELECT i.id, i.profile_id, d.sha256, d.filename, i.completed_at
        FROM ai.document_indexes AS i JOIN ai.documents AS d ON d.id = i.document_id
        JOIN ai.embedding_profiles AS ep ON ep.id = i.profile_id
        WHERE d.sha256 = ANY(%s::text[]) AND i.status = 'READY'
        AND ep.provider = 'ollama' AND ep.model = %s AND ep.model_identity = %s
        AND ep.dimensions = 1024 ORDER BY i.completed_at DESC, i.id DESC"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (hashes, model, digest))
            return await cur.fetchall()
