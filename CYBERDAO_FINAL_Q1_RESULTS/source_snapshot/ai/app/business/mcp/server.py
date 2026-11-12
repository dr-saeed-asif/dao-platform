"""Initialize the official MCP server and its read-only tool surface."""

from mcp.server import MCPServer

from .lifespan import operator_lifespan
from .tool_registry import register_tools

SERVER_VERSION = "1.0.0"


def create_server(lifespan=operator_lifespan) -> MCPServer:
    server = MCPServer(name="CyberDAO AI", version=SERVER_VERSION,
        instructions="Local operator-only, read-only DAO proposal research.", lifespan=lifespan)
    return register_tools(server)
