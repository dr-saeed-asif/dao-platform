"""Typed request planning and per-question execution results."""

from typing import Literal, TypedDict
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.model.config.limits import MAX_QUESTIONS

AgentName = Literal["proposal", "evidence", "research", "governance", "analysis", "blockchain"]
QuestionIntent = Literal["proposal", "proposal_count", "research", "voting", "evidence", "blockchain", "analysis"]


class QuestionPlanItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=3, max_length=4000)
    intent: QuestionIntent
    depends_on: list[int] = Field(default_factory=list, max_length=MAX_QUESTIONS)
    agents: list[AgentName] = Field(default_factory=list, max_length=6)

    @field_validator("question", mode="before")
    @classmethod
    def clean_question(cls, value):
        return value.strip() if isinstance(value, str) else value


class PlannedQuestion(BaseModel):
    question_id: str
    order: int
    question: str
    agent: AgentName
    depends_on: list[str] = Field(default_factory=list)
    agents: list[AgentName] = Field(default_factory=list)
    dropped_agents: list[str] = Field(default_factory=list)   # planner suggestions rejected by routing validation
    collect_only: bool = False


class CitedSource(BaseModel):
    source_id: str
    content: str
    metadata: dict = Field(default_factory=dict)


class QuestionResult(BaseModel):
    question_id: str
    question: str
    agent: AgentName | Literal["synthesis"]
    status: Literal["completed", "failed"]
    answer: str | None = None
    citations: list[str] = Field(default_factory=list)
    cited_sources: list[CitedSource] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    attempts: int = 0
    tool_calls: int = 0
    model_used: str | None = None
    retrieval_ms: float = 0
    generation_ms: float = 0
    total_ms: float = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    embedding_tokens: int | None = None
    execution: dict = Field(default_factory=dict)
    blockchain_verification: dict | None = None
    worker_results: list[dict] = Field(default_factory=list)


class MultiAgentResult(BaseModel):
    status: Literal["completed", "partial_failure", "failed"]
    results: list[QuestionResult]
    metrics: dict = Field(default_factory=dict)
    trace: list[dict] = Field(default_factory=list)
    final_response: QuestionResult | None = None


class AgentRunResponse(MultiAgentResult):
    conversation_id: UUID
    run_id: UUID | None
    reply: str | None = None


class QuestionState(TypedDict, total=False):
    plan: dict
    failure_kind: str
    dependency_context: str
    answer: str
    evidence: list[dict]
    citations: list[str]
    errors: list[str]
    status: str
    attempts: int
    tool_calls: int
    model_used: str | None
    retrieval_ms: float
    generation_ms: float
    total_ms: float
    input_tokens: int | None
    output_tokens: int | None
    embedding_tokens: int | None


# Streaming events
class StreamEventType(str):
    RUN_START = "run_start"
    QUESTION_START = "question_start"
    QUESTION_TOKEN = "question_token"
    QUESTION_COMPLETE = "question_complete"
    QUESTION_ERROR = "question_error"
    RUN_COMPLETE = "run_complete"
    RUN_ERROR = "run_error"


class StreamEvent(BaseModel):
    event: str
    conversation_id: UUID | None = None
    run_id: UUID | None = None
    question_id: str | None = None
    data: dict = Field(default_factory=dict)
    timestamp: float = Field(default_factory=lambda: __import__('time').time())
