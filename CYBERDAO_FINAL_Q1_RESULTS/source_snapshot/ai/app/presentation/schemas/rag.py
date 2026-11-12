"""RAG request validation schemas."""

from pydantic import BaseModel, Field, model_validator
from uuid import UUID

from app.model.config.limits import MAX_QUESTIONS, MAX_QUESTION_CHARS, MAX_TOTAL_CHARS


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    document_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    dao_id: str | None = Field(default=None, min_length=1, max_length=120)
    proposal_id: str | None = Field(default=None, min_length=1, max_length=120)
    top_k: int = Field(default=4, ge=1, le=8)

    @model_validator(mode="after")
    def source_selection(self):
        if self.document_sha256 and (self.dao_id or self.proposal_id):
            raise ValueError("Choose document or proposal scope, not both.")
        if not self.document_sha256 and not (self.dao_id and self.proposal_id):
            raise ValueError("Provide document_sha256 OR dao_id plus proposal_id.")
        return self


class SearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    document_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    top_k: int = Field(default=4, ge=1, le=8)


class ProposalRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    dao_id: str = Field(min_length=1, max_length=120)
    proposal_id: str = Field(min_length=1, max_length=120)
    top_k: int = Field(default=4, ge=1, le=8)
    profile_id: str | None = Field(default=None, max_length=120)


class ProposalAskRequest(ProposalRequest):
    system: str = "hybrid"


class AgentAskRequest(BaseModel):
    question: str | list[str]
    dao_id: str = Field(min_length=1, max_length=120)
    proposal_id: str = Field(min_length=1, max_length=120)
    top_k: int = Field(default=4, ge=1, le=8)
    concurrency: int | None = Field(default=None, ge=1, le=8)
    conversation_id: UUID | None = None
    title: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def questions_are_valid(self):
        values = [self.question] if isinstance(self.question, str) else self.question
        if (not values or len(values) > MAX_QUESTIONS or sum(map(len, values)) > MAX_TOTAL_CHARS
                or any(not item.strip() or len(item) > MAX_QUESTION_CHARS for item in values)):
            raise ValueError(f"Provide one to {MAX_QUESTIONS} nonempty questions up to {MAX_QUESTION_CHARS} characters.")
        return self


class ConversationCreate(BaseModel):
    dao_id: str = Field(min_length=1, max_length=120)
    proposal_id: str | None = Field(default=None, min_length=1, max_length=120)
    title: str | None = Field(default=None, max_length=200)


class ConversationResponse(BaseModel):
    id: UUID
    dao_id: str
    proposal_id: str | None
    title: str | None
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    question_ids: list[str]
    metadata: dict
    created_at: str
