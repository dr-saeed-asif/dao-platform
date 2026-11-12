"""Typed conversation and agent run entities."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID


@dataclass(frozen=True)
class Conversation:
    id: UUID
    dao_id: str
    proposal_id: Optional[str]
    title: Optional[str]
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class Message:
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    question_ids: list[str]
    metadata: dict
    created_at: datetime


@dataclass(frozen=True)
class AgentRun:
    id: UUID
    conversation_id: UUID
    message_id: Optional[UUID]
    status: str
    questions: list[dict]
    results: list[dict]
    total_ms: float
    tool_calls: int
    error: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]


@dataclass(frozen=True)
class AgentQuestionResult:
    id: UUID
    agent_run_id: UUID
    question_id: str
    question: str
    agent: str
    status: str
    answer: Optional[str]
    citations: list[str]
    evidence: list[dict]
    errors: list[str]
    attempts: int
    tool_calls: int
    model_used: Optional[str]
    retrieval_ms: float
    generation_ms: float
    total_ms: float
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    embedding_tokens: Optional[int]
    created_at: datetime