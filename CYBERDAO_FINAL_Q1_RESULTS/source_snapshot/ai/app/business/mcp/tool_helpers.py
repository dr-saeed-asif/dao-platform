"""Shared operator guard and metrics wrapper for MCP calls."""

from collections.abc import Awaitable, Callable

from app.business.evaluation.workflow import record_tool
from .context import ExecutionContext


def require_operator(context: ExecutionContext) -> None:
    if not context.operator_verified:
        raise PermissionError("Local operator access is required.")


async def tracked(context: ExecutionContext, tool_name: str, dao_id: str,
                  proposal_id: str | None, operation: Callable[[], Awaitable]):
    async def authorized_operation():
        require_operator(context)
        return await operation()

    return await record_tool(context.rag.recorder, authorized_operation(), tool_name,
                             dao_id, proposal_id)
