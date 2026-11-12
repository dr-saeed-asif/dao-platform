"""Structured summary of verified proposal evidence and index state."""

from pydantic import BaseModel

from .document_status_result import IndexMetadata
from .results import ToolErrorDetail


class EvidenceDocumentStatus(BaseModel):
    evidence_id: str
    filename: str
    evidence_status: str
    index_status: str
    indexes: list[IndexMetadata]


class EvidenceStatusData(BaseModel):
    dao_id: str
    proposal_id: str
    verified_linked_count: int
    ready_index_count: int
    documents: list[EvidenceDocumentStatus]


class EvidenceStatusResult(BaseModel):
    success: bool
    data: EvidenceStatusData | None = None
    error: ToolErrorDetail | None = None
