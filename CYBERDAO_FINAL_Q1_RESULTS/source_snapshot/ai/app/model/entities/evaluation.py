"""Typed, content-free metrics for one AI workflow run."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RunMetrics:
    run_id: str
    system_type: str
    system_version: str
    selected_model: str
    embedding_profile: str | None
    dao_id: str | None
    proposal_id: str | None
    retrieval_ms: float
    generation_ms: float
    total_ms: float
    embedding_tokens: int | None
    input_tokens: int | None
    output_tokens: int | None
    tool_calls: int
    source_ids: tuple[str, ...]
    citation_count: int
    completion_status: str
    error_type: str | None = None
