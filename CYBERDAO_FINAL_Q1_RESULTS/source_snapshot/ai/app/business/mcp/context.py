"""Lifespan-owned services and operator authorization for MCP requests."""

from dataclasses import dataclass

from app.business.rag.service import RagService
from app.model.database.interfaces import DatabasePool


@dataclass(frozen=True)
class ExecutionContext:
    pool: DatabasePool
    rag: RagService
    operator_verified: bool
