"""FastAPI resource lifecycle."""

from contextlib import asynccontextmanager

from app.model.config.settings import settings
from app.model.database.pool import create_pool


@asynccontextmanager
async def lifespan(app):
    pool = create_pool(settings.postgres_url, enforce_runtime_role=True)
    await pool.open(wait=True, timeout=5)
    app.state.db_pool = pool
    app.state.rag_pool = pool
    try:
        yield
    finally:
        await pool.close()
