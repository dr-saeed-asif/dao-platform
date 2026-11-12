"""Read and lock page-v1 legacy index state."""

from typing import Any

from app.model.database.interfaces import DatabasePool
from app.model.entities.legacy_pdf import PdfChunk


async def existing_keys(pool: DatabasePool, digest: str, profile_id: str) -> list[tuple]:
    query = """SELECT i.status, c.chunk_key FROM ai.document_indexes i
        JOIN ai.documents d ON d.id=i.document_id
        LEFT JOIN ai.indexed_chunks c ON c.document_index_id=i.id
        WHERE d.sha256=%s AND i.profile_id=%s ORDER BY c.page_number,c.chunk_index"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(query, (digest, profile_id))
            return await cursor.fetchall()


async def lock_index(cursor: Any, document_id: int, profile_id: str) -> tuple[int, str]:
    await cursor.execute("""INSERT INTO ai.document_indexes (document_id,profile_id)
        VALUES (%s,%s) ON CONFLICT (document_id,profile_id) DO NOTHING""",
        (document_id, profile_id))
    await cursor.execute("""SELECT id,status FROM ai.document_indexes
        WHERE document_id=%s AND profile_id=%s FOR UPDATE""", (document_id, profile_id))
    return await cursor.fetchone()


async def verify_ready(cursor: Any, index_id: int, chunks: list[PdfChunk]) -> None:
    await cursor.execute("SELECT chunk_key FROM ai.indexed_chunks WHERE document_index_id=%s "
                         "ORDER BY page_number,chunk_index", (index_id,))
    keys = [row[0] for row in await cursor.fetchall()]
    if keys != [chunk.chunk_id for chunk in chunks]:
        raise ValueError("Existing READY index has unexpected chunks.")
