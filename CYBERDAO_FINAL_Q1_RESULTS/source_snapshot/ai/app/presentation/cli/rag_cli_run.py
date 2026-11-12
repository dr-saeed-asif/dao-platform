"""Run one RAG command with a short-lived database pool."""

from app.business.rag.service import RagService
from app.model.config.settings import settings
from app.model.database.pool import create_pool
from .rag_dispatch import dispatch


async def execute(args) -> None:
    pool = create_pool(settings.postgres_url)
    await pool.open(wait=True, timeout=5)
    try:
        await dispatch(args, pool, RagService(pool))
    finally:
        await pool.close()
