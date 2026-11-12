"""Path-free structured content returned for one authorized PDF chunk."""

from pydantic import BaseModel

from .results import ToolErrorDetail


class ProposalChunkData(BaseModel):
    dao_id: str
    proposal_id: str
    evidence_id: str
    filename: str
    chunk_key: str
    page_number: int
    chunk_index: int
    content: str


class ProposalChunkResult(BaseModel):
    success: bool
    data: ProposalChunkData | None = None
    error: ToolErrorDetail | None = None
