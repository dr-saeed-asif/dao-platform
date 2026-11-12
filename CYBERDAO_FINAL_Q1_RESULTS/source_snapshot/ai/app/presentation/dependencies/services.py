"""Request-scoped service and pool providers."""

from fastapi import Depends, Request
from app.model.database.interfaces import DatabasePool
from app.business.rag.service import RagService


def get_database_pool(request: Request) -> DatabasePool:
    return request.app.state.db_pool


def get_rag_service(pool: DatabasePool = Depends(get_database_pool)) -> RagService:
    return RagService(pool)
