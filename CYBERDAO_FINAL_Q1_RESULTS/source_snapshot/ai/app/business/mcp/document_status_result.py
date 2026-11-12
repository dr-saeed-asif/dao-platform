"""Structured metadata for verified proposal document index states."""

from datetime import datetime

from pydantic import BaseModel

from .results import ToolErrorDetail


class IndexMetadata(BaseModel):
    index_id: int
    profile_id: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    model: str
    dimensions: int
    chunk_count: int


class DocumentIndexData(BaseModel):
    dao_id: str
    proposal_id: str
    evidence_id: str
    filename: str
    evidence_status: str
    index_status: str
    indexes: list[IndexMetadata]


class DocumentIndexResult(BaseModel):
    success: bool
    data: DocumentIndexData | None = None
    error: ToolErrorDetail | None = None
