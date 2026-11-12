"""Open and close the local database pool around the MCP server."""

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from mcp.server import MCPServer

from app.business.rag.service import RagService
from app.model.config.settings import settings
from app.model.database.pool import create_pool
from .context import ExecutionContext
from .validation import require_operator_token


@asynccontextmanager
async def operator_lifespan(server: MCPServer) -> AsyncIterator[ExecutionContext]:
    token = os.environ.get("CYBERDAO_MCP_OPERATOR_TOKEN")
    require_operator_token(token, settings.rag_dev_token.get_secret_value())
    pool = create_pool(settings.postgres_url, enforce_runtime_role=True)
    await pool.open(wait=True, timeout=5)
    try:
        yield ExecutionContext(pool, RagService(pool), operator_verified=True)
    finally:
        await pool.close()
