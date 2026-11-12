"""Register the read-only local health tool."""

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.types import ToolAnnotations

from app.business.health import health_status
from .context import ExecutionContext
from .errors import safe_tool_error


def register_health(server: MCPServer) -> None:
    @server.tool(annotations=ToolAnnotations(read_only_hint=True,
        destructive_hint=False, open_world_hint=False))
    async def health(ctx: Context[ExecutionContext]) -> dict[str, str]:
        """Return local AI service health without changing data."""
        try:
            _operator(ctx)
            result = await health_status(ctx.request_context.lifespan_context.pool)
            return {"status": result["status"], "postgres": result["postgres"],
                    "ollama": result["ollama"]["status"]}
        except Exception as exc:
            raise safe_tool_error(exc) from None


def _operator(ctx: Context[ExecutionContext]) -> None:
    if not ctx.request_context.lifespan_context.operator_verified:
        raise PermissionError("Local operator access is required.")
