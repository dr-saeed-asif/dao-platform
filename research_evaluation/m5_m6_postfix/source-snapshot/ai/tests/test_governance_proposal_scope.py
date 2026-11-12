"""Characterize proposal DAO scope, profile choice, and empty discovery."""

import unittest
from unittest.mock import AsyncMock, patch

from app.business.governance.proposal_scope import proposal_scope
from governance_fakes import SHA, OTHER_SHA, Pool, artefact


class ProposalScopeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # These tests isolate profile selection; byte integrity is tested with real files.
        from app.business.governance.evidence import verified_pdf_record
        self.integrity = patch("app.business.governance.proposal_scope.current_evidence",
                               new=AsyncMock(side_effect=lambda pool, record: verified_pdf_record(record)))
        self.integrity.start()
        self.addCleanup(self.integrity.stop)

    async def test_scope_uses_linked_hashes_and_one_requested_profile(self):
        valid, unlinked = artefact(), artefact(evidence_id="other", computed_hash=OTHER_SHA,
            expected_hash="sha256:" + OTHER_SHA, lifecycle_state="STAGED")
        rows = {"links": [tuple(valid.values()), tuple(unlinked.values())],
            "indexes": [(12, "profile-v1", SHA, "old.pdf", "2026-01-01"),
                        (13, "profile-v2", SHA, "new.pdf", "2026-02-01")]}
        pool = Pool(rows)
        with patch("app.business.governance.proposal_scope.Ollama.digest",
                   new_callable=AsyncMock, return_value="c" * 64):
            scope = await proposal_scope(pool, "dao-A", "proposal-1", "profile-v2")
        self.assertEqual(scope["profile_id"], "profile-v2")
        self.assertEqual([item["index_id"] for item in scope["indexes"]], [13])
        self.assertEqual(scope["linked_pdf_count"], 1)
        self.assertEqual(len(scope["excluded"]), 1)
        self.assertEqual(pool.calls[0].c.queries[0][1], ("proposal-1", "dao-A"))
        self.assertEqual(pool.calls[1].c.queries[0][1][0], [SHA])

    async def test_missing_authoritative_documents_returns_empty_scope(self):
        pool = Pool({"links": [], "indexes": []})
        scope = await proposal_scope(pool, "dao-A", "proposal-1")
        self.assertEqual(scope["indexes"], [])
        self.assertEqual(len(pool.calls), 1)


if __name__ == "__main__": unittest.main()
