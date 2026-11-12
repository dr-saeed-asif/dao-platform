"""Regressions from the frozen M5 stale-evidence experiment."""
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.business.governance.proposal_scope import proposal_scope
from governance_fakes import Pool, artefact


class CurrentEvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_replaced_file_is_excluded_before_ready_index_lookup(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "document.pdf"
            original = b"%PDF-original bytes"
            digest = hashlib.sha256(original).hexdigest()
            record = artefact(computed_hash=digest, expected_hash=digest,
                              storage_key="document.pdf", byte_size=len(original))
            path.write_bytes(b"%PDF-altered bytes!")
            with patch("app.business.governance.proposal_scope.linked_artefacts", new=AsyncMock(return_value=[record])), \
                 patch("app.business.governance.proposal_scope.ready_proposal_indexes", new=AsyncMock()) as lookup, \
                 patch("app.business.governance.proposal_scope.settings.dao_artefact_storage_dir", folder), \
                 patch("app.business.governance.current_evidence.invalidate_document_indexes", new=AsyncMock(return_value=1)) as purge, \
                 patch("app.business.governance.proposal_scope.Ollama.digest", new=AsyncMock(return_value="fixture")):
                scope = await proposal_scope(Pool({}), "dao", "proposal")
            self.assertEqual(scope["indexes"], [])
            lookup.assert_not_awaited()
            purge.assert_awaited_once()

    async def test_missing_storage_configuration_excludes_without_deleting_valid_indexes(self):
        from app.business.governance.current_evidence import current_evidence
        with patch("app.business.governance.current_evidence.settings.dao_artefact_storage_dir", None), \
             patch("app.business.governance.current_evidence.invalidate_document_indexes", new=AsyncMock()) as purge:
            valid, reason = await current_evidence(object(), artefact())
        self.assertFalse(valid)
        self.assertIn("not configured", reason)
        purge.assert_not_awaited()

    async def test_failed_and_revoked_records_trigger_derived_cleanup(self):
        from app.business.governance.current_evidence import current_evidence
        for record in (artefact(verification_status="FAILED"), artefact(lifecycle_state="ORPHANED")):
            with self.subTest(record=record), patch(
                "app.business.governance.current_evidence.invalidate_document_indexes",
                new=AsyncMock(return_value=1),
            ) as purge:
                valid, _ = await current_evidence(object(), record)
            self.assertFalse(valid)
            purge.assert_awaited_once()

    async def test_valid_bytes_remain_usable_without_cleanup(self):
        from app.business.governance.current_evidence import current_evidence
        with tempfile.TemporaryDirectory() as folder:
            data = b"%PDF-original bytes"
            Path(folder, "file.pdf").write_bytes(data)
            digest = hashlib.sha256(data).hexdigest()
            record = artefact(computed_hash=digest, expected_hash=digest,
                              storage_key="file.pdf", byte_size=len(data))
            with patch("app.business.governance.current_evidence.settings.dao_artefact_storage_dir", folder), \
                 patch("app.business.governance.current_evidence.invalidate_document_indexes", new=AsyncMock()) as purge:
                valid, _ = await current_evidence(object(), record)
            self.assertTrue(valid)
            purge.assert_not_awaited()

    async def test_standalone_hash_lookup_cannot_bypass_known_revocation(self):
        from app.business.rag.store import RagStore
        store = RagStore(object(), AsyncMock())
        with patch("app.business.rag.store.artefacts_for_hash", new=AsyncMock(return_value=[artefact(verification_status="FAILED")])), \
             patch("app.business.rag.store.current_evidence", new=AsyncMock(return_value=(False, "revoked"))), \
             patch("app.business.rag.store.ready_index", new=AsyncMock()) as lookup:
            with self.assertRaisesRegex(ValueError, "revoked"):
                await store.ready_index("a" * 64)
        lookup.assert_not_awaited()
