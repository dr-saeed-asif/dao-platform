"""Operator-guarded orchestration for DAO proposal comparison and voting facts."""

from app.business.governance.proposal_facts import compare_proposals, voting_facts
from .context import ExecutionContext
from .errors import error_detail
from .governance_results import GovernanceData, GovernanceResult
from .tool_helpers import tracked


async def comparison_tool(context: ExecutionContext, dao_id: str, proposal_a: str,
                          proposal_b: str) -> GovernanceResult:
    try:
        result = await tracked(context, "compare_dao_proposals", dao_id, proposal_a,
            lambda: compare_proposals(context.pool, dao_id, proposal_a, proposal_b))
        return GovernanceResult(success=True, data=GovernanceData(facts=result))
    except Exception as exc:
        return GovernanceResult(success=False, error=error_detail(exc))


async def voting_facts_tool(context: ExecutionContext, dao_id: str,
                            proposal_id: str) -> GovernanceResult:
    try:
        result = await tracked(context, "get_proposal_voting_facts", dao_id, proposal_id,
            lambda: voting_facts(context.pool, dao_id, proposal_id))
        return GovernanceResult(success=True, data=GovernanceData(facts=result))
    except Exception as exc:
        return GovernanceResult(success=False, error=error_detail(exc))
