"""Cursor operations for indexed chunks and their READY state."""

from app.model.entities.documents import Chunk


async def lock_index(cur, document_id: int, profile_id: str) -> tuple[int, str]:
    await cur.execute("""INSERT INTO ai.document_indexes (document_id, profile_id)
        VALUES (%s, %s) ON CONFLICT (document_id, profile_id) DO NOTHING""",
        (document_id, profile_id))
    await cur.execute("""SELECT id, status FROM ai.document_indexes
        WHERE document_id = %s AND profile_id = %s FOR UPDATE""",
        (document_id, profile_id))
    return await cur.fetchone()


async def verify_chunks(cur, index_id: int, chunks: list[Chunk]) -> None:
    await cur.execute("""SELECT chunk_key FROM ai.indexed_chunks
        WHERE document_index_id = %s ORDER BY page_number, chunk_index""", (index_id,))
    if [row[0] for row in await cur.fetchall()] != [chunk.key for chunk in chunks]:
        raise ValueError("Concurrent READY index has different chunks.")


async def replace_chunks(cur, index_id: int, chunks: list[Chunk], vectors: list[list[float]]):
    await cur.execute("DELETE FROM ai.indexed_chunks WHERE document_index_id = %s", (index_id,))
    for chunk, vector in zip(chunks, vectors, strict=True):
        literal = "[" + ",".join(str(value) for value in vector) + "]"
        await cur.execute("""INSERT INTO ai.indexed_chunks
            (document_index_id, chunk_key, chunk_index, page_number, content,
            embedding, embedding_dimension)
            VALUES (%s,%s,%s,%s,%s,%s::public.vector,%s)""",
            (index_id, chunk.key, chunk.position, chunk.page, chunk.text, literal, 1024))


async def mark_ready(cur, index_id: int) -> None:
    await cur.execute("""UPDATE ai.document_indexes
        SET status='READY', error_message=NULL, started_at=NOW(), completed_at=NOW()
        WHERE id=%s""", (index_id,))
