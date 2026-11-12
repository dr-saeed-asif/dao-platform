"""Verify proposal-linked checks precede private chunk reads."""

import unittest
from unittest.mock import AsyncMock, patch

from app.business.governance.document_chunk import proposal_document_chunk
from app.business.governance.document_status import DocumentScopeError
from governance_fakes import artefact


class DocumentChunkScopeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Scope adapter unit fixture; filesystem integrity has dedicated regressions.
        self.integrity = patch("app.business.governance.document_chunk.current_evidence",
                               new=AsyncMock(return_value=(True, "fixture")))
        self.integrity.start()
        self.addCleanup(self.integrity.stop)

    async def test_verified_link_selects_only_its_hash_index(self):
        with patch("app.business.governance.document_status.get_proposal", new=AsyncMock()), \
             patch("app.business.governance.document_status.linked_artefacts",
                   new=AsyncMock(return_value=[artefact()])), \
             patch("app.business.governance.document_chunk.proposal_scope",
                   new=AsyncMock(return_value={"indexes": [{"index_id": 17,
                       "document_sha256": "a" * 64}]})), \
             patch("app.business.governance.document_chunk.chunk_for_indexes",
                   new=AsyncMock(return_value={"chunk_key": "k", "page_number": 2,
                       "chunk_index": 1, "content": "evidence"})) as read:
            result = await proposal_document_chunk(object(), "dao-A", "proposal-A", "evidence-2", "k")
        self.assertEqual(result["content"], "evidence")
        self.assertEqual(read.await_args.args[1], [17])

    async def test_unlinked_evidence_never_reaches_chunk_adapter(self):
        with patch("app.business.governance.document_status.get_proposal", new=AsyncMock()), \
             patch("app.business.governance.document_status.linked_artefacts",
                   new=AsyncMock(return_value=[])), \
             patch("app.business.governance.document_chunk.chunk_for_indexes",
                   new=AsyncMock()) as read:
            with self.assertRaises(DocumentScopeError):
                await proposal_document_chunk(object(), "dao-A", "proposal-A", "wrong", "k")
        read.assert_not_awaited()
