"""Typed result envelope for scoped proposal evidence search."""

from pydantic import BaseModel

from .results import ToolErrorDetail


class EvidenceChunk(BaseModel):
    source_id: str
    artefact_evidence_id: str | None = None
    filename: str | None = None
    chunk_key: str | None = None
    page_number: int | None = None
    chunk_index: int | None = None
    score: float | None = None
    content: str


class EvidenceData(BaseModel):
    retrieval_ms: float | None = None
    embedding_ms: float | None = None
    embedding_tokens: int | None = None
    dao_id: str
    proposal_id: str
    profile_id: str | None
    evidence: list[EvidenceChunk]


class EvidenceResult(BaseModel):
    success: bool
    data: EvidenceData | None = None
    error: ToolErrorDetail | None = None
