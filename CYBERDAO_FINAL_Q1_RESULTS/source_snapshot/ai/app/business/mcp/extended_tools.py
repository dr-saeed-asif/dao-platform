"""Register the additional read-only proposal time and document tools."""

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.types import ToolAnnotations

from .chunk_tool import chunk_tool
from .context import ExecutionContext
from .document_status_result import DocumentIndexResult
from .chunk_result import ProposalChunkResult
from .evidence_status_result import EvidenceStatusResult
from .evidence_status_tool import evidence_status_tool
from .index_status_tool import index_status_tool
from .inputs import Identifier
from .time_result import TimeWindowResult
from .time_window_tool import time_window_tool


def register_extended_tools(server: MCPServer) -> None:
    readonly = ToolAnnotations(read_only_hint=True, destructive_hint=False,
                               open_world_hint=False)
    _time_tool(server, readonly)
    _index_tool(server, readonly)
    _chunk_tool(server, readonly)
    _evidence_status_tool(server, readonly)


def _time_tool(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def get_proposal_time_window(dao_id: Identifier, proposal_id: Identifier,
            ctx: Context[ExecutionContext]) -> TimeWindowResult:
        """Show stored proposal status separately from its current time window."""
        return await time_window_tool(ctx.request_context.lifespan_context, dao_id, proposal_id)


def _index_tool(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def get_document_index_status(dao_id: Identifier, proposal_id: Identifier,
            evidence_id: Identifier, ctx: Context[ExecutionContext]) -> DocumentIndexResult:
        """Read index metadata for a verified PDF linked to this proposal."""
        return await index_status_tool(ctx.request_context.lifespan_context,
                                       dao_id, proposal_id, evidence_id)


def _chunk_tool(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def get_proposal_document_chunk(dao_id: Identifier, proposal_id: Identifier,
            evidence_id: Identifier, chunk_key: Identifier,
            ctx: Context[ExecutionContext]) -> ProposalChunkResult:
        """Read one chunk only from a verified, authoritatively linked PDF."""
        return await chunk_tool(ctx.request_context.lifespan_context, dao_id,
                                proposal_id, evidence_id, chunk_key)


def _evidence_status_tool(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def get_proposal_evidence_status(dao_id: Identifier, proposal_id: Identifier,
            ctx: Context[ExecutionContext]) -> EvidenceStatusResult:
        """Summarize linked evidence and its verified/indexed state."""
        return await evidence_status_tool(ctx.request_context.lifespan_context,
                                          dao_id, proposal_id)
