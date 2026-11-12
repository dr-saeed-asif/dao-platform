"""Register the four DAO-scoped proposal tools."""

from typing import Annotated

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.types import ToolAnnotations
from pydantic import Field

from .context import ExecutionContext
from .document_tools import documents_tool
from .evidence_tool import evidence_tool
from .inputs import Identifier, Question, WalletAddress
from .proposal_read_tools import assignment_tool, proposal_tool
from .results import AssignmentResult, ProposalResult
from .evidence_results import DocumentsResult
from .evidence_search_results import EvidenceResult


def register_proposal_tools(server: MCPServer) -> None:
    annotations = ToolAnnotations(read_only_hint=True, destructive_hint=False,
                                  open_world_hint=False)
    _register_proposal(server, annotations)
    _register_assignment(server, annotations)
    _register_documents(server, annotations)
    _register_evidence(server, annotations)


def _register_proposal(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def get_proposal(dao_id: Identifier, proposal_id: Identifier,
                           ctx: Context[ExecutionContext]) -> ProposalResult:
        """Read one proposal that belongs to the supplied DAO."""
        return await proposal_tool(ctx.request_context.lifespan_context, dao_id, proposal_id)


def _register_assignment(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def check_proposal_assignment(dao_id: Identifier, proposal_id: Identifier,
            wallet_address: WalletAddress, ctx: Context[ExecutionContext]) -> AssignmentResult:
        """Trusted operator diagnostic only; wallet input never authenticates."""
        return await assignment_tool(ctx.request_context.lifespan_context, dao_id,
                                     proposal_id, wallet_address)


def _register_documents(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def list_proposal_documents(dao_id: Identifier, proposal_id: Identifier,
                                      ctx: Context[ExecutionContext]) -> DocumentsResult:
        """List only verified, linked PDF artefacts and compatible indexes."""
        return await documents_tool(ctx.request_context.lifespan_context, dao_id, proposal_id)


def _register_evidence(server: MCPServer, annotations: ToolAnnotations) -> None:
    @server.tool(annotations=annotations)
    async def search_proposal_evidence(dao_id: Identifier, proposal_id: Identifier,
            question: Question, ctx: Context[ExecutionContext],
            top_k: Annotated[int, Field(ge=1, le=8)] = 4) -> EvidenceResult:
        """Search verified PDF evidence linked to this DAO proposal."""
        return await evidence_tool(ctx.request_context.lifespan_context,
                                   dao_id, proposal_id, question, top_k)
