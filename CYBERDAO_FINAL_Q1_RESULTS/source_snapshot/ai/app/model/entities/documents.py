"""Indexed document and page chunk entities."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    key: str
    page: int
    position: int
    text: str


@dataclass(frozen=True)
class Document:
    sha256: str
    filename: str
    byte_size: int
    pages: int
    status: str
    possible_ocr_pages: list[int]
    chunks: list[Chunk]


ParsedPdf = Document
