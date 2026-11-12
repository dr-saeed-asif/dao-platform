"""Proposal and assignment read-only MCP operations."""

from .context import ExecutionContext
from .errors import error_detail
from .results import AssignmentData, AssignmentResult, ProposalResult
from .tool_helpers import require_operator, tracked
from app.business.governance.proposals import check_assignment, get_proposal


async def proposal_tool(context: ExecutionContext, dao_id: str,
                        proposal_id: str) -> ProposalResult:
    try:
        value = await tracked(context, "get_proposal", dao_id, proposal_id,
                              lambda: get_proposal(context.pool, dao_id, proposal_id))
        return ProposalResult(success=True, data=value)
    except Exception as exc:
        return ProposalResult(success=False, error=error_detail(exc))


async def assignment_tool(context: ExecutionContext, dao_id: str,
                          proposal_id: str, wallet_address: str) -> AssignmentResult:
    try:
        assigned = await tracked(context, "check_proposal_assignment", dao_id, proposal_id,
            lambda: check_assignment(context.pool, dao_id, proposal_id, wallet_address))
        data = AssignmentData(dao_id=dao_id, proposal_id=proposal_id, assigned=assigned)
        return AssignmentResult(success=True, data=data)
    except Exception as exc:
        return AssignmentResult(success=False, error=error_detail(exc))
