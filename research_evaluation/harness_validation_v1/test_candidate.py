"""Candidate baseline adapter checks; fixture evidence, no model or database."""
import unittest
from single_agent_candidate_v2 import check_scope, evidence_rows
from app.business.agents.synthesis import CitationRegistry

class CandidateTests(unittest.TestCase):
    def test_same_dao_comparison_is_not_limited_to_selected_proposal(self):
        check_scope({'dao': 'd', 'proposal': 'selected'},
                    {'dao_id': 'd', 'proposal_a': 'other-a', 'proposal_b': 'other-b'})

    def test_wrong_dao_is_rejected(self):
        with self.assertRaises(PermissionError):
            check_scope({'dao': 'd', 'proposal': 'selected'}, {'dao_id': 'another'})

    def test_single_proposal_scope_guard_is_retained(self):
        with self.assertRaises(PermissionError):
            check_scope({'dao': 'd', 'proposal': 'selected'}, {'proposal_id': 'other'})

    def test_failed_tool_does_not_create_evidence(self):
        with self.assertRaises(RuntimeError):
            evidence_rows('get_proposal', {'success': False}, CitationRegistry())

    def test_worker_local_document_ids_are_canonicalized_across_calls(self):
        registry = CitationRegistry()
        a = evidence_rows('search_proposal_evidence', {'evidence': [
            {'source_id': 'D1', 'content': 'Fixture passage alpha'}]}, registry)
        b = evidence_rows('search_proposal_evidence', {'evidence': [
            {'source_id': 'D1', 'content': 'Fixture passage beta'}]}, registry)
        self.assertEqual(a[0]['source_id'], 'D1')
        self.assertEqual(b[0]['source_id'], 'D2')
        self.assertEqual(len(registry.sources), 2)

if __name__ == '__main__':
    unittest.main()
