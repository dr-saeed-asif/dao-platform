"""Return one chunk after DAO, proposal, link, hash, and index checks."""

from app.business.governance.document_chunk import proposal_document_chunk
from .chunk_result import ProposalChunkData, ProposalChunkResult
from .context import ExecutionContext
from .errors import error_detail
from .tool_helpers import tracked


async def chunk_tool(context: ExecutionContext, dao_id: str, proposal_id: str,
                     evidence_id: str, chunk_key: str) -> ProposalChunkResult:
    try:
        row = await tracked(context, "get_proposal_document_chunk", dao_id, proposal_id,
            lambda: proposal_document_chunk(context.pool, dao_id, proposal_id,
                                            evidence_id, chunk_key))
        return ProposalChunkResult(success=True, data=ProposalChunkData(**row))
    except Exception as exc:
        return ProposalChunkResult(success=False, error=error_detail(exc))
