"""Operator-guarded orchestration for DAO proposal discovery tools."""

from app.business.governance.dao_proposals import count_proposals, list_proposals, search_proposals
from .context import ExecutionContext
from .errors import error_detail
from .governance_results import ProposalListData, ProposalListResult
from .tool_helpers import tracked


async def list_tool(context: ExecutionContext, dao_id: str,
                    limit: int) -> ProposalListResult:
    return await _run(context, "list_dao_proposals", dao_id, None,
        lambda: list_proposals(context.pool, dao_id, limit))


async def count_tool(context: ExecutionContext, dao_id: str) -> dict:
    return await tracked(context, "count_dao_proposals", dao_id, None,
        lambda: count_proposals(context.pool, dao_id))


async def search_tool(context: ExecutionContext, dao_id: str, query: str,
                      limit: int) -> ProposalListResult:
    return await _run(context, "search_dao_proposals", dao_id, None,
        lambda: search_proposals(context.pool, dao_id, query, limit))


async def _run(context, name: str, dao_id: str, proposal_id: str | None,
               operation) -> ProposalListResult:
    try:
        rows = await tracked(context, name, dao_id, proposal_id, operation)
        return ProposalListResult(success=True, data=ProposalListData(
            dao_id=dao_id, proposals=rows, count=len(rows)))
    except Exception as exc:
        return ProposalListResult(success=False, error=error_detail(exc))
