"""PDF indexing use case; persistence is delegated to model adapters."""

from pathlib import Path

from app.model.config.settings import settings
from app.model.database.index_writer import persist_index
from app.model.database.indexes import existing_keys
from app.model.entities.results import IndexingResult
from .pdf_extraction import parse_pdf
from .embedding_profiles import current_profile


async def index_document(pool, ollama, path: Path) -> dict:
    document = parse_pdf(path)
    if document.status != "READY" or not document.chunks:
        raise ValueError(f"Document status {document.status}; pages to review: "
                         f"{document.possible_ocr_pages}. Indexing skipped.")
    profile = await current_profile(ollama)
    rows = await existing_keys(pool, document.sha256, profile.id)
    keys = [chunk.key for chunk in document.chunks]
    if rows and rows[0][0] == "READY":
        if [row[1] for row in rows] != keys:
            raise ValueError("READY index has unexpected chunk identities.")
        return index_result(document, profile.id, "ALREADY_INDEXED", 0)
    vectors, latency, _ = await ollama.embed([chunk.text for chunk in document.chunks])
    if len(vectors) != len(document.chunks):
        raise ValueError("Vector count mismatch.")
    _, state = await persist_index(pool, document, profile, vectors)
    status = "ALREADY_INDEXED" if state == "READY" else "INDEXED"
    return index_result(document, profile.id, status, latency if status == "INDEXED" else 0)


def index_result(document, profile_id: str, status: str, latency: float) -> dict:
    return IndexingResult(status, document.sha256, document.filename, document.pages,
        len(document.chunks), profile_id, settings.ollama_embed_model, 1024, latency).as_dict()
