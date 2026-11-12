"""Compatibility exports for legacy PDF processing."""

from app.business.rag.legacy_pdf_chunking import chunk_page, normalize_text
from app.business.rag.legacy_pdf_policy import (
    CHUNKING_VERSION, MAX_PAGES, MAX_PDF_SIZE, MIN_TEXT_CHARS,
    OVERLAP_RATIO, TARGET_TOKENS,
)
from app.business.rag.legacy_pdf_processing import process_pdf
from app.model.entities.legacy_pdf import PdfChunk, PdfResult

__all__ = ["PdfChunk", "PdfResult", "MAX_PDF_SIZE", "MAX_PAGES", "TARGET_TOKENS",
           "OVERLAP_RATIO", "CHUNKING_VERSION", "MIN_TEXT_CHARS", "normalize_text",
           "chunk_page", "process_pdf"]
