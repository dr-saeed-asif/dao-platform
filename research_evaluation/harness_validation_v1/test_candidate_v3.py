"""New error-transparency contract, fixture results only."""
import unittest
from app.business.agents.synthesis import CitationRegistry
from single_agent_candidate_v3 import tool_reply

class ErrorTransparencyTests(unittest.TestCase):
    def test_failure_keeps_business_code_and_message_without_creating_evidence(self):
        registry = CitationRegistry()
        error = {'code': 'chunk_not_found', 'message': 'Requested fixture chunk is unavailable.'}
        reply, status = tool_reply('get_proposal_document_chunk', {'success': False, 'error': error}, registry)
        self.assertEqual(reply['error'], error)
        self.assertEqual(status, 'failed')
        self.assertFalse(registry.sources)

    def test_success_keeps_existing_canonical_evidence(self):
        reply, status = tool_reply('get_proposal', {'success': True, 'data': {'title': 'Fixture'}}, CitationRegistry())
        self.assertEqual(status, 'completed')
        self.assertEqual(reply['evidence'][0]['source_id'], 'G1')
        self.assertIn('Fixture', reply['evidence'][0]['content'])

if __name__ == '__main__':
    unittest.main()
