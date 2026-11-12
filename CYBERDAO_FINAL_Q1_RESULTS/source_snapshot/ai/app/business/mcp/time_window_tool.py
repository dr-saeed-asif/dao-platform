"""Read stored proposal state and calculate its present time window."""

from app.business.governance.proposals import get_proposal
from .context import ExecutionContext
from .errors import error_detail
from .time_result import TimeWindowData, TimeWindowResult
from .time_window import proposal_time_window
from .tool_helpers import tracked


async def time_window_tool(context: ExecutionContext, dao_id: str,
                           proposal_id: str) -> TimeWindowResult:
    try:
        row = await tracked(context, "get_proposal_time_window", dao_id, proposal_id,
            lambda: get_proposal(context.pool, dao_id, proposal_id))
        data = {"dao_id": dao_id, "proposal_id": proposal_id, **proposal_time_window(row)}
        data["status_explanation"] = (
            "stored_status is the DAO record value; time_window_state is derived from "
            "starts_at and ends_at at evaluated_at.")
        return TimeWindowResult(success=True, data=TimeWindowData(**data))
    except Exception as exc:
        return TimeWindowResult(success=False, error=error_detail(exc))
