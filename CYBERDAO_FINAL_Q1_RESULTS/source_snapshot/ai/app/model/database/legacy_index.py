"""Transactional page-v1 index persistence for the retained index_pdf script."""

from typing import Any

from app.model.database.interfaces import DatabasePool
from app.model.database.legacy_index_chunks import mark_ready, replace_chunks
from app.model.database.legacy_index_records import document_id, profile
from app.model.database.legacy_index_state import lock_index, verify_ready
from app.model.entities.legacy_pdf import PdfResult
from app.model.entities.results import EmbeddingResult


async def persist_index(pool: DatabasePool, pdf: PdfResult, filename: str, profile_id: str,
                        byte_size: int, identity: dict, result: EmbeddingResult) -> bool:
    async with pool.connection(timeout=5) as conn:
        async with conn.transaction():
            async with conn.cursor() as cursor:
                doc_id = await document_id(cursor, pdf, filename, byte_size)
                await profile(cursor, profile_id, identity)
                index_id, status = await lock_index(cursor, doc_id, profile_id)
                if status == "READY":
                    await verify_ready(cursor, index_id, pdf.chunks)
                    return False
                await replace_chunks(cursor, index_id, pdf.chunks, result)
                await mark_ready(cursor, index_id)
    return True
