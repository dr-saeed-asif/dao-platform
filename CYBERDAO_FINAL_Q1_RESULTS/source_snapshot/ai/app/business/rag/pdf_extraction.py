"""PDF validation, text extraction, and page metadata."""

from hashlib import sha256
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from app.model.entities.documents import Chunk, ParsedPdf
from .pdf_chunking import chunks_for_page, clean_text
from .pdf_policy import MAX_BYTES, MAX_CHUNKS, MAX_PAGES


def parse_pdf(path: Path) -> ParsedPdf:
    if not path.is_file():
        raise ValueError("PDF path does not exist.")
    size, data = path.stat().st_size, path.read_bytes()
    if not 0 < size <= MAX_BYTES:
        raise ValueError("PDF must be between 1 byte and 10 MB.")
    if b"%PDF-" not in data[:1024]:
        raise ValueError("The file does not have a PDF header.")
    digest = sha256(data).hexdigest()
    try:
        reader = PdfReader(BytesIO(data), strict=True)
        pages = _extract_pages(reader, digest)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"PDF could not be parsed ({type(exc).__name__}).") from exc
    count, chunks, ocr = len(reader.pages), pages[0], pages[1]
    status = "OCR_REQUIRED" if len(ocr) == count else "PARTIAL_TEXT" if ocr else "READY"
    return ParsedPdf(digest, path.name, size, count, status, ocr, chunks)


def _extract_pages(reader, digest: str) -> tuple[list[Chunk], list[int]]:
    if reader.is_encrypted:
        raise ValueError("Encrypted PDFs are not supported.")
    count, chunks, ocr = len(reader.pages), [], []
    if not 0 < count <= MAX_PAGES:
        raise ValueError("PDF must contain 1–150 pages.")
    for number, page in enumerate(reader.pages, 1):
        text = clean_text(page.extract_text() or "")
        if len(text) < 20:
            ocr.append(number)
        else:
            chunks.extend(chunks_for_page(text, number, digest))
        if len(chunks) > MAX_CHUNKS:
            raise ValueError("PDF exceeds the 250-chunk test limit.")
    return chunks, ocr
