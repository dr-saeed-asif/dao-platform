"""Structured JSON results for linked document and evidence tools."""

from pydantic import BaseModel

from .results import ToolErrorDetail


class DocumentReference(BaseModel):
    evidence_id: str
    filename: str
    verification_status: str
    lifecycle_state: str


class DocumentsData(BaseModel):
    dao_id: str
    proposal_id: str
    documents: list[DocumentReference]
    indexed_documents: list[dict]
    profile_id: str | None


class DocumentsResult(BaseModel):
    success: bool
    data: DocumentsData | None = None
    error: ToolErrorDetail | None = None
