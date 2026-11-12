"""Typed results returned by embedding and retrieval adapters."""

from dataclasses import asdict, dataclass


@dataclass
class EmbeddingResult:
    model: str
    dimensions: int
    vectors: list[list[float]]
    latency_ms: float
    input_tokens: int | None


@dataclass(frozen=True)
class IndexingResult:
    status: str
    document_sha256: str
    filename: str
    pages: int
    chunks: int
    profile_id: str
    embedding_model: str
    embedding_dimensions: int
    embedding_ms: float

    def as_dict(self) -> dict:
        return asdict(self)
