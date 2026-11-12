"""Search evidence only within verified, linked proposal PDFs."""

from app.business.evaluation.workflow import record_search
from .context import ExecutionContext
from .errors import error_detail
from .evidence_search_results import EvidenceChunk, EvidenceData, EvidenceResult
from .tool_helpers import require_operator


async def evidence_tool(context: ExecutionContext, dao_id: str, proposal_id: str,
                        question: str, top_k: int) -> EvidenceResult:
    try:
        async def operation():
            require_operator(context)
            return await context.rag.search_proposal(question, dao_id=dao_id,
                proposal_id=proposal_id, top_k=top_k)

        found = await record_search(context.rag.recorder, operation(), dao_id, proposal_id)
        rows = [EvidenceChunk(source_id=row["source_id"], content=row["content"],
            artefact_evidence_id=row.get("artefact_evidence_id"),
            filename=row.get("filename"), chunk_key=row.get("chunk_key"),
            page_number=row.get("page_number"), chunk_index=row.get("chunk_index"),
            score=row.get("score")) for row in found["evidence"]]
        data = EvidenceData(dao_id=dao_id, proposal_id=proposal_id,
            profile_id=found["profile_id"], evidence=rows, retrieval_ms=found.get("retrieval_ms"), embedding_ms=found.get("embedding_ms"), embedding_tokens=found.get("embedding_tokens"))
        return EvidenceResult(success=True, data=data)
    except Exception as exc:
        return EvidenceResult(success=False, error=error_detail(exc))
