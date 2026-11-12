"""Legacy PDF extraction use case and result formatting."""

import hashlib
from io import BytesIO
from pathlib import Path
from time import perf_counter

from pypdf import PdfReader

from app.model.entities.legacy_pdf import PdfResult
from .legacy_pdf_chunking import chunk_page, normalize_text
from .legacy_pdf_policy import MAX_PAGES, MAX_PDF_SIZE, MIN_TEXT_CHARS


def process_pdf(file_path: str | Path) -> PdfResult:
    path = Path(file_path)
    if not path.is_file(): raise ValueError("PDF file does not exist.")
    size = path.stat().st_size
    if size == 0 or size > MAX_PDF_SIZE: raise ValueError("PDF must be between 1 byte and 10 MB.")
    data = path.read_bytes()
    if b"%PDF-" not in data[:1024]: raise ValueError("File is not a valid PDF.")
    digest = hashlib.sha256(data).hexdigest()
    started = perf_counter()
    pages, ocr, count = _extract_pages(data)
    extraction_ms = (perf_counter() - started) * 1000
    started = perf_counter()
    text_pages = [(number, text) for number, text in pages if len(text) >= MIN_TEXT_CHARS]
    chunks = [chunk for number, text in text_pages for chunk in chunk_page(text, number, digest)]
    chunking_ms = (perf_counter() - started) * 1000
    status = "OCR_REQUIRED" if not text_pages else "PARTIAL_TEXT" if ocr else "READY"
    return PdfResult(digest, status, count, len(text_pages), ocr, chunks,
                     round(extraction_ms, 2), round(chunking_ms, 2))


def _extract_pages(data: bytes) -> tuple[list[tuple[int, str]], list[int], int]:
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted: raise ValueError("Encrypted PDFs are not supported yet.")
    count = len(reader.pages)
    if count == 0 or count > MAX_PAGES: raise ValueError("Unsupported PDF page count.")
    pages = [(n, normalize_text(page.extract_text() or ""))
             for n, page in enumerate(reader.pages, 1)]
    ocr = [number for number, text in pages if len(text) < MIN_TEXT_CHARS]
    return pages, ocr, count
