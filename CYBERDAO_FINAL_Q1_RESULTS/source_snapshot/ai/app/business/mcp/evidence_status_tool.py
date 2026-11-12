"""Summarize verified linked evidence and current index state for a proposal."""

from app.business.governance.document_status import proposal_evidence_status
from .context import ExecutionContext
from .errors import error_detail
from .evidence_status_result import EvidenceStatusData, EvidenceStatusResult
from .tool_helpers import tracked


async def evidence_status_tool(context: ExecutionContext, dao_id: str,
                               proposal_id: str) -> EvidenceStatusResult:
    try:
        row = await tracked(context, "get_proposal_evidence_status", dao_id, proposal_id,
            lambda: proposal_evidence_status(context.pool, dao_id, proposal_id))
        return EvidenceStatusResult(success=True, data=EvidenceStatusData(**row))
    except Exception as exc:
        return EvidenceStatusResult(success=False, error=error_detail(exc))
