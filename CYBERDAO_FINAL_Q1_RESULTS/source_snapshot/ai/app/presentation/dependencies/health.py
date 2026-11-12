"""Health response dependency."""

from fastapi import Depends
from app.business.health import health_status
from app.model.database.interfaces import DatabasePool
from .services import get_database_pool


async def get_health_status(pool: DatabasePool = Depends(get_database_pool)) -> dict:
    return await health_status(pool)
