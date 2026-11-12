"""Embedding profile identity stored with each document index."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EmbeddingProfile:
    id: str
    provider: str
    model: str
    model_identity: str
    dimensions: int
    settings: dict[str, Any]
