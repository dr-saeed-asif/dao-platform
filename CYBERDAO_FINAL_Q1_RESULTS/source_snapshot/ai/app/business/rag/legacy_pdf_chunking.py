"""Chunking helpers for the legacy standalone PDF service."""

import hashlib
import math
import re

from app.model.entities.legacy_pdf import PdfChunk
from .legacy_pdf_policy import CHUNKING_VERSION, OVERLAP_RATIO, TARGET_TOKENS


def normalize_text(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def chunk_page(text: str, page_number: int, document_hash: str) -> list[PdfChunk]:
    text = " ".join(text.split())
    target, overlap = TARGET_TOKENS * 4, math.ceil(TARGET_TOKENS * 4 * OVERLAP_RATIO)
    chunks, start, index = [], 0, 0
    while start < len(text):
        end = min(start + target, len(text))
        split = text.rfind(" ", start + target // 2, end) if end < len(text) else -1
        if split > start: end = split
        content = text[start:end].strip()
        if content:
            identity = f"{document_hash}:{CHUNKING_VERSION}:{page_number}:{index}"
            chunks.append(PdfChunk(hashlib.sha256(identity.encode()).hexdigest(),
                page_number, index, content, math.ceil(len(content) / 4)))
            index += 1
        if end >= len(text): break
        start = max(start + 1, end - overlap)
    return chunks
