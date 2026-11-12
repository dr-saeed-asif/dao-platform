"""Replace and complete page-v1 index chunks transactionally."""

from typing import Any

from app.model.entities.legacy_pdf import PdfChunk
from app.model.entities.results import EmbeddingResult


async def replace_chunks(cursor: Any, index_id: int, chunks: list[PdfChunk],
                         result: EmbeddingResult) -> None:
    await cursor.execute("DELETE FROM ai.indexed_chunks WHERE document_index_id=%s", (index_id,))
    for chunk, vector in zip(chunks, result.vectors, strict=True):
        literal = "[" + ",".join(str(value) for value in vector) + "]"
        await cursor.execute("""INSERT INTO ai.indexed_chunks
            (document_index_id,chunk_key,chunk_index,page_number,content,embedding,embedding_dimension)
            VALUES (%s,%s,%s,%s,%s,%s::public.vector,%s)""",
            (index_id, chunk.chunk_id, chunk.chunk_index, chunk.page_number,
             chunk.content, literal, result.dimensions))


async def mark_ready(cursor: Any, index_id: int) -> None:
    await cursor.execute("""UPDATE ai.document_indexes SET status='READY',error_message=NULL,
        started_at=NOW(),completed_at=NOW() WHERE id=%s""", (index_id,))
