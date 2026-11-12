"""Register bounded DAO proposal count diagnostics."""

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.types import ToolAnnotations

from .context import ExecutionContext
from .dao_proposal_tools_impl import count_tool
from .errors import error_detail
from .governance_results import GovernanceData, GovernanceResult
from .inputs import Identifier


def register_count_tool(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def count_dao_proposals(dao_id: Identifier,
            ctx: Context[ExecutionContext]) -> GovernanceResult:
        """Count proposals in the requested DAO."""
        try:
            count = await count_tool(ctx.request_context.lifespan_context, dao_id)
            facts = GovernanceData(facts={"dao_id": dao_id, "proposal_count": count})
            return GovernanceResult(success=True, data=facts)
        except Exception as exc:
            return GovernanceResult(success=False, error=error_detail(exc))
