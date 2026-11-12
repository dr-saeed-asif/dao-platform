"""Discard derived embeddings for invalid document bytes while retaining audit metadata."""
from app.business.governance.evidence import normalized_sha256


async def invalidate_document_indexes(pool, digest: str, reason: str) -> int:
    digest = normalized_sha256(digest)
    if digest is None:
        return 0
    async with pool.connection(timeout=5) as conn:
        async with conn.transaction():
            async with conn.cursor() as cur:
                # Same row locks used by index writers serialize deletion with reindexing.
                await cur.execute("""SELECT i.id FROM ai.document_indexes i
                    JOIN ai.documents d ON d.id=i.document_id
                    WHERE d.sha256=%s ORDER BY i.id FOR UPDATE OF i""", (digest,))
                ids = [row[0] for row in await cur.fetchall()]
                if not ids:
                    return 0
                await cur.execute("""UPDATE ai.document_indexes SET status='FAILED',
                    error_message=%s, completed_at=NOW() WHERE id=ANY(%s::bigint[])""",
                    (reason[:500], ids))
                await cur.execute("""DELETE FROM ai.indexed_chunks
                    WHERE document_index_id=ANY(%s::bigint[])""", (ids,))
                return cur.rowcount
