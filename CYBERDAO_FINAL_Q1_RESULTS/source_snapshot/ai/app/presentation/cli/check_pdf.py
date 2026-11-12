"""Command-line inspection of extracted PDF text and page chunks."""

import argparse
from app.services.pdf_service import process_pdf


def _display(result) -> None:
    print("PDF processing completed\n------------------------")
    for label, value in (("Status", result.status), ("SHA-256", result.sha256),
        ("Pages", result.page_count), ("Pages with text", result.pages_with_text),
        ("Possible OCR pages", result.possible_ocr_pages), ("Chunks", len(result.chunks)),
        ("Extraction (ms)", result.extraction_ms), ("Chunking (ms)", result.chunking_ms)):
        print(f"{label}:", value)
    print("\nChunk information:")
    for chunk in result.chunks[:10]:
        print(f"Page {chunk.page_number}, chunk {chunk.chunk_index}, "
              f"estimated tokens {chunk.estimated_tokens}")
    if result.status == "OCR_REQUIRED":
        print("\nNo sufficient extractable text. OCR or manual review is required.")
    elif result.status == "PARTIAL_TEXT":
        print("\nSome pages need manual review for missing text or OCR.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Test local PDF extraction and chunking")
    parser.add_argument("--pdf", required=True, help="Path to a local PDF document")
    try:
        _display(process_pdf(parser.parse_args().pdf))
    except Exception as error:
        print("FAILED\nError type:", type(error).__name__, "\nReason:", str(error))
        raise SystemExit(1) from None
