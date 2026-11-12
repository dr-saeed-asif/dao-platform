"""Read-only listing for AI-owned indexed PDF documents."""

from psycopg_pool import AsyncConnectionPool


async def list_documents(pool: AsyncConnectionPool) -> list[dict]:
    query = """SELECT d.sha256, d.filename, i.status, i.profile_id, p.model, COUNT(c.id)
        FROM ai.documents d JOIN ai.document_indexes i ON i.document_id=d.id
        JOIN ai.embedding_profiles p ON p.id=i.profile_id
        LEFT JOIN ai.indexed_chunks c ON c.document_index_id=i.id
        GROUP BY d.id, d.sha256, d.filename, i.id, i.status, i.profile_id, p.model
        ORDER BY d.id DESC, i.id DESC LIMIT 50"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query)
            rows = await cur.fetchall()
    return [{"document_sha256": row[0], "filename": row[1], "status": row[2],
             "profile_id": row[3], "model": row[4], "chunks": row[5]}
            for row in rows]
