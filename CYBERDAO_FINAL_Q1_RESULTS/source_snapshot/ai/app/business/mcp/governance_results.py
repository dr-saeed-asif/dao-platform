"""Structured result models for DAO proposal governance tools."""

from pydantic import BaseModel

from .results import ToolErrorDetail


class ProposalListData(BaseModel):
    dao_id: str
    proposals: list[dict]
    count: int


class ProposalListResult(BaseModel):
    success: bool
    data: ProposalListData | None = None
    error: ToolErrorDetail | None = None


class GovernanceData(BaseModel):
    facts: dict


class GovernanceResult(BaseModel):
    success: bool
    data: GovernanceData | None = None
    error: ToolErrorDetail | None = None
