"""Result entities for the legacy standalone PDF extraction service."""

from dataclasses import dataclass


@dataclass
class PdfChunk:
    chunk_id: str
    page_number: int
    chunk_index: int
    content: str
    estimated_tokens: int


@dataclass
class PdfResult:
    sha256: str
    status: str
    page_count: int
    pages_with_text: int
    possible_ocr_pages: list[int]
    chunks: list[PdfChunk]
    extraction_ms: float
    chunking_ms: float
