"""Page-aware paragraph and sentence chunking with stable IDs."""

from hashlib import sha256
import re

from app.model.entities.documents import Chunk
from .pdf_policy import CHUNKING_VERSION, OVERLAP_CHARS, TARGET_CHARS


def clean_text(text: str) -> str:
    text = text.replace("\x00", " ").replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()


def split_end(text: str, start: int) -> int:
    desired = min(len(text), start + TARGET_CHARS)
    if desired == len(text):
        return desired
    floor = start + TARGET_CHARS // 2
    sentences = max(text.rfind(". ", floor, desired), text.rfind("? ", floor, desired),
                    text.rfind("! ", floor, desired))
    for boundary in (text.rfind("\n\n", floor, desired), sentences,
                     text.rfind(" ", floor, desired)):
        if boundary > start:
            return boundary + (2 if text[boundary:boundary + 2] == "\n\n" else 1)
    return desired


def chunks_for_page(text: str, page: int, digest: str) -> list[Chunk]:
    result, start = [], 0
    while start < len(text):
        end = split_end(text, start)
        if end <= start:
            raise ValueError("Chunker made no forward progress.")
        content = text[start:end].strip()
        if content:
            position = len(result)
            key = sha256(f"{digest}:{CHUNKING_VERSION}:{page}:{position}".encode()).hexdigest()
            result.append(Chunk(key, page, position, content))
        if end >= len(text):
            break
        start = max(start + 1, end - OVERLAP_CHARS)
    return result
