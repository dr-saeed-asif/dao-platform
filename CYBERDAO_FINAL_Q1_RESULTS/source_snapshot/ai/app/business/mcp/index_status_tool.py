"""Read index state only for a verified artefact linked to this proposal."""

from app.business.governance.document_status import document_index_status
from .context import ExecutionContext
from .document_status_result import DocumentIndexData, DocumentIndexResult
from .errors import error_detail
from .tool_helpers import tracked


async def index_status_tool(context: ExecutionContext, dao_id: str, proposal_id: str,
                            evidence_id: str) -> DocumentIndexResult:
    try:
        row = await tracked(context, "get_document_index_status", dao_id, proposal_id,
            lambda: document_index_status(context.pool, dao_id, proposal_id, evidence_id))
        return DocumentIndexResult(success=True, data=DocumentIndexData(**row))
    except Exception as exc:
        return DocumentIndexResult(success=False, error=error_detail(exc))
