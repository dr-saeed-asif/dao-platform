"""Structured JSON result models for the proposal tools."""

from pydantic import BaseModel


class ToolErrorDetail(BaseModel):
    code: str
    message: str


class ProposalResult(BaseModel):
    success: bool
    data: dict | None = None
    error: ToolErrorDetail | None = None


class AssignmentData(BaseModel):
    dao_id: str
    proposal_id: str
    assigned: bool
    diagnostic_only: bool = True
    authenticated: bool = False


class AssignmentResult(BaseModel):
    success: bool
    data: AssignmentData | None = None
    error: ToolErrorDetail | None = None
