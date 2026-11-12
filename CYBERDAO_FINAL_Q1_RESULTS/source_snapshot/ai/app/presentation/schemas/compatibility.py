"""Request schema for the existing frontend-shaped AI query."""

from pydantic import BaseModel, Field


class LegacyQuery(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    proposalId: str = Field(min_length=1, max_length=120)
    daoId: str | None = Field(default=None, min_length=1, max_length=120)
    system: str = "hybrid"
    topK: int = Field(default=4, ge=1, le=8)
    datasetVersion: str | None = None
    policyVersion: str | None = None
