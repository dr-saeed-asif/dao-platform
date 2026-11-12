"""Format legacy page-v1 index command results."""

from app.model.entities.legacy_pdf import PdfResult
from app.model.entities.results import EmbeddingResult
from app.business.rag.legacy_profile import DIMENSIONS


def index_result(pdf: PdfResult, profile_id: str, embedding: EmbeddingResult | None,
                 inserted: bool, message: str) -> dict:
    status = "INDEXED" if inserted else "ALREADY_INDEXED"
    return {"status": status, "sha256": pdf.sha256, "profile_id": profile_id,
        "pages": pdf.page_count, "chunks": len(pdf.chunks),
        "dimensions": embedding.dimensions if embedding else DIMENSIONS,
        "embedding_ms": embedding.latency_ms if embedding else 0.0, "message": message}
