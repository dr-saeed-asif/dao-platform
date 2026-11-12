"""Verify only hash-checked linked PDFs expose AI index state."""

import unittest
from unittest.mock import AsyncMock, patch

from app.business.governance.document_status import (document_index_status,
    proposal_evidence_status)
from governance_fakes import artefact


class DocumentStatusTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from app.business.governance.evidence import verified_pdf_record
        self.integrity = patch("app.business.governance.document_status.current_evidence",
                               new=AsyncMock(side_effect=lambda pool, record: verified_pdf_record(record)))
        self.integrity.start()
        self.addCleanup(self.integrity.stop)

    async def test_verified_link_returns_metadata_from_matching_hash(self):
        indexes = [{"index_id": 8, "profile_id": "p1", "status": "READY",
            "started_at": None, "completed_at": None, "model": "embed-v1",
            "dimensions": 1024, "chunk_count": 2}]
        with patch("app.business.governance.document_status.linked_artifact",
                   new=AsyncMock(return_value=artefact(filename=r"C:\private\report.pdf"))), \
             patch("app.business.governance.document_status.indexes_for_hash",
                   new=AsyncMock(return_value=indexes)) as query:
            result = await document_index_status(object(), "dao-A", "proposal-A", "evidence-2")
        self.assertEqual(result["index_status"], "ready")
        self.assertEqual(result["filename"], "report.pdf")
        self.assertEqual(query.await_args.args[1], "a" * 64)
        self.assertNotIn("storage_key", result)

    async def test_unlinked_artifact_is_reported_but_never_queried(self):
        staged = artefact(lifecycle_state="STAGED")
        with patch("app.business.governance.document_status.get_proposal", new=AsyncMock()), \
             patch("app.business.governance.document_status.linked_artefacts",
                   new=AsyncMock(return_value=[staged])), \
             patch("app.business.governance.document_status.indexes_for_hash",
                   new=AsyncMock()) as query:
            result = await proposal_evidence_status(object(), "dao-A", "proposal-A")
        self.assertEqual(result["verified_linked_count"], 0)
        self.assertEqual(result["documents"][0]["index_status"], "not_checked")
        query.assert_not_awaited()
