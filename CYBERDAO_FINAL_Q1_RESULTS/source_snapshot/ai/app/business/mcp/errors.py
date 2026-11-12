"""Safe tool errors without leaking backend exception details."""

import logging

from app.business.governance.proposals import ProposalNotFound
from app.business.governance.document_status import (DocumentNotIndexed,
    DocumentNotVerified, DocumentScopeError, ProposalChunkNotFound)
from .results import ToolErrorDetail

from mcp.server.mcpserver.exceptions import ToolError

logger = logging.getLogger(__name__)


def safe_tool_error(error: Exception) -> ToolError:
    if isinstance(error, PermissionError):
        return ToolError("Local operator access is required.")
    if isinstance(error, ValueError):
        return ToolError("Request is invalid or the proposal is unavailable.")
    logger.warning("MCP tool failed (%s)", type(error).__name__)
    return ToolError("The requested AI operation is unavailable.")


def error_detail(error: Exception) -> ToolErrorDetail:
    if isinstance(error, PermissionError):
        return ToolErrorDetail(code="operator_required", message=str(error))
    if isinstance(error, ProposalNotFound):
        return ToolErrorDetail(code="proposal_not_found", message=str(error))
    if isinstance(error, (DocumentScopeError, DocumentNotVerified,
                          DocumentNotIndexed, ProposalChunkNotFound)):
        return ToolErrorDetail(code=error.code, message=str(error))
    if isinstance(error, ValueError):
        return ToolErrorDetail(code="invalid_request", message=str(error))
    logger.warning("MCP tool failed (%s)", type(error).__name__)
    return ToolErrorDetail(code="operation_unavailable",
                           message="The requested operation is unavailable.")
