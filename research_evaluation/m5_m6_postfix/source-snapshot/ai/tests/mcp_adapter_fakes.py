"""Mock database and Ollama adapter boundaries for MCP protocol tests."""

from unittest.mock import AsyncMock, patch

from governance_fakes import SHA, artefact
from mcp_use_case_fixtures import DAO_ID, PDF_ANSWER, PROPOSAL, PROPOSAL_ID


def start_patch(test_case, target, **options):
    active = patch(target, **options)
    test_case.addCleanup(active.stop)
    return active.start()


def install_adapter_fakes(test_case, *, links=None, chunks=None, proposal_row=None,
                          index_rows=None, scoped_indexes=None, chunk_result=None):
    async def proposal(pool, *, dao_id, local_proposal_id):
        row = proposal_row or PROPOSAL
        return row if (dao_id, local_proposal_id) == (DAO_ID, PROPOSAL_ID) else None
    for target in ("app.business.governance.proposals.get_proposal_in_dao",
                   "app.business.governance.retrieval.get_proposal_in_dao"):
        start_patch(test_case, target, side_effect=proposal)
    start_patch(test_case, "app.business.governance.proposals.is_proposal_member",
                new_callable=AsyncMock, return_value=True)
    # Protocol tests isolate MCP adapters. Dedicated integrity tests use real files.
    from app.business.governance.evidence import verified_pdf_record
    for target in ("app.business.governance.proposal_scope.current_evidence",
                   "app.business.governance.document_chunk.current_evidence",
                   "app.business.governance.document_status.current_evidence"):
        start_patch(test_case, target, new=AsyncMock(
            side_effect=lambda pool, record: verified_pdf_record(record)))
    rows = [artefact()] if links is None else links
    for target in ("app.business.governance.documents.linked_artefacts",
                   "app.business.governance.proposal_scope.linked_artefacts",
                   "app.business.governance.document_status.linked_artefacts"):
        start_patch(test_case, target, new_callable=AsyncMock, return_value=rows)
    search = _rag_adapters(test_case, links, chunks, scoped_indexes)
    start_patch(test_case, "app.business.governance.document_status.indexes_for_hash",
                new_callable=AsyncMock, return_value=index_rows or [])
    found = chunk_result if chunk_result is not None else {
        "chunk_key": "report-page-2", "page_number": 2, "chunk_index": 0,
        "content": PDF_ANSWER}
    start_patch(test_case, "app.business.governance.document_chunk.chunk_for_indexes",
                new_callable=AsyncMock, return_value=found)
    return search


def _rag_adapters(test_case, links, chunks, scoped_indexes):
    indexes = scoped_indexes
    if indexes is None:
        indexes = [] if links is not None else [(17, "profile-test", SHA, "report.pdf", "2026-01-01")]
    start_patch(test_case, "app.business.governance.proposal_scope.ready_proposal_indexes",
                new_callable=AsyncMock, return_value=indexes)
    start_patch(test_case, "app.business.rag.ollama_client.Ollama.digest",
                new_callable=AsyncMock, return_value="c" * 64)
    start_patch(test_case, "app.business.rag.ollama_client.Ollama.embed",
                new_callable=AsyncMock, return_value=([[0.0] * 1024], 1.2, 8))
    result = chunks or [(17, "report-page-2", 2, 0, PDF_ANSWER, 0.92)]
    return start_patch(test_case, "app.business.rag.proposal_search.search_proposal_chunks",
        new_callable=AsyncMock, return_value=result)
