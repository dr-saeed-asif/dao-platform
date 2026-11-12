"""Retain the page-v1 index_pdf workflow behind small use-case functions."""

from pathlib import Path
from collections.abc import Callable
from app.business.rag.ollama_client import Ollama
from app.business.rag.legacy_profile import DIMENSIONS, profile_identity
from app.business.rag.legacy_index_result import index_result
from app.model.config.settings import settings
from app.model.database.interfaces import DatabasePool
from app.model.database.legacy_index import persist_index
from app.model.database.legacy_index_state import existing_keys
from app.model.database.pool import create_pool
from app.model.entities.legacy_pdf import PdfResult
from app.business.rag.legacy_pdf_processing import process_pdf


async def embed_texts(texts: list[str]):
    return await Ollama().embed_result(texts)


async def index_pdf(filename: str, on_embedding: Callable[[int, str], None] | None = None) -> dict:
    path = Path(filename)
    pdf = process_pdf(path)
    if pdf.status != "READY" or not pdf.chunks:
        raise ValueError(f"PDF is not ready for indexing: {pdf.status}.")
    if len(pdf.chunks) > 20:
        raise ValueError("For this first test, use a PDF with at most 20 chunks.")
    identity, profile_id = await profile_identity()
    pool = create_pool(settings.postgres_url)
    try:
        await pool.open(wait=True, timeout=5)
        return await _index_open_pool(pool, path, pdf, identity, profile_id, on_embedding)
    finally:
        await pool.close()


async def _index_open_pool(pool: DatabasePool, path: Path, pdf: PdfResult,
                           identity: dict, profile_id: str,
                           on_embedding: Callable[[int, str], None] | None) -> dict:
    keys = [chunk.chunk_id for chunk in pdf.chunks]
    rows = await existing_keys(pool, pdf.sha256, profile_id)
    if rows and rows[0][0] == "READY":
        if [row[1] for row in rows if row[1] is not None] != keys:
            raise ValueError("Existing READY index has unexpected chunks.")
        return index_result(pdf, profile_id, None, False, "No new embeddings generated.")
    if on_embedding: on_embedding(len(pdf.chunks), identity["model"])
    result = await embed_texts([chunk.content for chunk in pdf.chunks])
    if result.model != identity["model"] or result.dimensions != DIMENSIONS:
        raise ValueError("Embedding model or dimensions do not match.")
    inserted = await persist_index(pool, pdf, path.name, profile_id,
                                   path.stat().st_size, identity, result)
    message = "PDF vectors saved successfully." if inserted else "Another run completed first."
    return index_result(pdf, profile_id, result, inserted, message)
