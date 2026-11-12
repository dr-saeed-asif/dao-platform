"""Compatibility exports for the PDF extraction pipeline."""

from app.model.entities.documents import Chunk, ParsedPdf
from app.business.rag.pdf_chunking import (
    chunks_for_page as _chunks_for_page, clean_text as _clean, split_end as _split_end,
)
from app.business.rag.pdf_extraction import parse_pdf
from app.business.rag.pdf_policy import (
    CHUNKING_VERSION, MAX_BYTES, MAX_CHUNKS, MAX_PAGES, OVERLAP_CHARS,
    PREPROCESS_VERSION, TARGET_CHARS,
)

__all__ = ["Chunk", "ParsedPdf", "MAX_BYTES", "MAX_PAGES", "MAX_CHUNKS",
           "TARGET_CHARS", "OVERLAP_CHARS", "CHUNKING_VERSION", "PREPROCESS_VERSION",
           "parse_pdf", "_clean", "_split_end", "_chunks_for_page"]
