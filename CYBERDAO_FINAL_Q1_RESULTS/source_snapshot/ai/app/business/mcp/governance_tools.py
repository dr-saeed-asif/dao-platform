"""Register the third group of read-only DAO governance MCP tools."""

from typing import Annotated

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.types import ToolAnnotations
from pydantic import Field

from .context import ExecutionContext
from .dao_count_tool import register_count_tool
from .dao_proposal_tools_impl import list_tool, search_tool
from .governance_tools_impl import comparison_tool, voting_facts_tool
from .inputs import Identifier, Question
from .governance_results import GovernanceResult, ProposalListResult


def register_governance_tools(server: MCPServer) -> None:
    safe = ToolAnnotations(read_only_hint=True, destructive_hint=False,
                           open_world_hint=False)
    _register_discovery(server, safe)
    _register_comparison(server, safe)
    _register_voting(server, safe)


def _register_discovery(server: MCPServer, annotations: ToolAnnotations) -> None:
    register_count_tool(server, annotations)

    @server.tool(annotations=annotations)
    async def list_dao_proposals(dao_id: Identifier, ctx: Context[ExecutionContext],
            limit: Annotated[int, Field(ge=1, le=50)] = 20) -> ProposalListResult:
        """List up to 50 proposals stored under one DAO."""
        return await list_tool(ctx.request_context.lifespan_context, dao_id, limit)

    @server.tool(annotations=annotations)
    async def search_dao_proposals(dao_id: Identifier, query: Question,
            ctx: Context[ExecutionContext],
            limit: Annotated[int, Field(ge=1, le=50)] = 20) -> ProposalListResult:
        """Search proposal title, purpose and description within one DAO."""
        return await search_tool(ctx.request_context.lifespan_context,
                                 dao_id, query, limit)


def _register_comparison(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def compare_dao_proposals(dao_id: Identifier, proposal_a: Identifier,
            proposal_b: Identifier,
            ctx: Context[ExecutionContext]) -> GovernanceResult:
        """Compare two proposals after checking each belongs to the requested DAO."""
        return await comparison_tool(ctx.request_context.lifespan_context,
                                     dao_id, proposal_a, proposal_b)


def _register_voting(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def get_proposal_voting_facts(dao_id: Identifier,
            proposal_id: Identifier,
            ctx: Context[ExecutionContext]) -> GovernanceResult:
        """Return stored voting fields and explicitly identify unsupported facts."""
        return await voting_facts_tool(ctx.request_context.lifespan_context,
                                       dao_id, proposal_id)
