"""Compose MCP tool registrars."""

from mcp.server import MCPServer

from .health_tool import register_health
from .extended_tools import register_extended_tools
from .proposal_tools import register_proposal_tools
from .governance_tools import register_governance_tools


def register_tools(server: MCPServer) -> MCPServer:
    register_health(server)
    register_proposal_tools(server)
    register_extended_tools(server)
    register_governance_tools(server)
    return server
