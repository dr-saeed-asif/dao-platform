"""Evidence records shared across governance and document retrieval."""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Evidence:
    source_id: str
    content: Any
    source: str | None = None
    score: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict:
        result = {"source_id": self.source_id, **self.metadata}
        if self.source is not None:
            result["source"] = self.source
        result["content"] = self.content
        if self.score is not None:
            result["score"] = self.score
        return result
