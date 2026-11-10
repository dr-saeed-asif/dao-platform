"""Confirmed malformed-marker regression and unchanged citation contracts."""
import unittest
from app.business.agents.models import CitedSource, QuestionResult
from app.business.agents.synthesis import synthesize
from app.business.agents.quality import verify_citations
from app.business.rag.ollama_answers import ABSTENTION

class CitationMarkerTests(unittest.TestCase):
    def test_valid_marker_cannot_hide_a_malformed_or_unsupported_reference(self):
        for token in ('B987', 'D 987', 'd1', ' D1 ', 'G 2', 'D1, G2'):
            with self.subTest(token=token):
                result = verify_citations(f'Fact [D1] [{token}].', [{'source_id': 'D1'}])
                self.assertFalse(result['valid'])
                self.assertIn(token, result['malformed'])

    def test_known_canonical_references_and_nonreference_brackets_still_work(self):
        result = verify_citations('Fact [D1] [G2], array [0], note [Option 1].',
                                  [{'source_id': 'D1'}, {'source_id': 'G2'}])
        self.assertTrue(result['valid'])
        self.assertEqual(result['malformed'], [])

    def test_unknown_canonical_id_still_fails(self):
        result = verify_citations('Fact [D1] [G987].', [{'source_id': 'D1'}])
        self.assertFalse(result['valid'])
        self.assertEqual(result['unknown'], ['G987'])

    def test_abstention_and_missing_reference_behavior_is_preserved(self):
        self.assertTrue(verify_citations(ABSTENTION, [])['valid'])
        self.assertFalse(verify_citations('Uncited fact.', [])['valid'])

    def test_reference_validation_remains_separate_from_semantic_support(self):
        self.assertTrue(verify_citations('Dashboard EUR 6,000 [D1].', [{
            'source_id': 'D1', 'content': 'Security review EUR 6,000; dashboard EUR 3,000.'}])['valid'])

class ActiveGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_synthesis_rejects_hidden_invalid_markers(self):
        worker = QuestionResult(question_id='q1', question='Explain the source', agent='evidence',
            status='completed', answer='Retrieved supporting source material [D1]',
            citations=['D1'], cited_sources=[CitedSource(source_id='D1', content='A supported fixture fact.')])
        for marker in ('B987', 'D 987'):
            with self.subTest(marker=marker):
                class Model:
                    async def chat(self, *args, **kwargs):
                        return f'TASK q1:\nFact [D1] [{marker}].', 0, {}
                result = await synthesize(worker.question, [worker], Model(), 'fixture-no-model')
                self.assertTrue(result.errors)
                self.assertNotIn(f'[{marker}]', result.answer)

if __name__ == '__main__':
    unittest.main()
