"""Read verified and linked proposal document references."""

from app.business.governance.documents import verified_proposal_documents
from .context import ExecutionContext
from .errors import error_detail
from .evidence_results import DocumentReference, DocumentsData, DocumentsResult
from .tool_helpers import tracked


async def documents_tool(context: ExecutionContext, dao_id: str,
                         proposal_id: str) -> DocumentsResult:
    try:
        result = await tracked(context, "list_proposal_documents", dao_id,
            proposal_id, lambda: _documents(context, dao_id, proposal_id))
        rows = [DocumentReference(**row) for row in result["linked_artefacts"]
                if row.get("status") == "verified" and row.get("lifecycle_state") == "LINKED"]
        data = DocumentsData(dao_id=dao_id, proposal_id=proposal_id, documents=rows,
            indexed_documents=result["indexed_documents"], profile_id=result["profile_id"])
        return DocumentsResult(success=True, data=data)
    except Exception as exc:
        return DocumentsResult(success=False, error=error_detail(exc))


async def _documents(context: ExecutionContext, dao_id: str, proposal_id: str) -> dict:
    from app.business.governance.proposals import get_proposal
    await get_proposal(context.pool, dao_id, proposal_id)
    return await verified_proposal_documents(context.pool, proposal_id, dao_id)
