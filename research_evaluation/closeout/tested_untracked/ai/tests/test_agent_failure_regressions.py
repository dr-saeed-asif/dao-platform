"""Application regressions, independent of evaluation adapters and benchmark gold."""
import unittest

from app.business.agents.models import CitedSource, QuestionPlanItem, QuestionResult
from app.business.agents.planning import plan_questions
from app.business.agents.synthesis import synthesize


class SourceCoverageTests(unittest.TestCase):
    def plan(self, text, intent='evidence', agents=None):
        return plan_questions([text], [QuestionPlanItem(
            question=text, intent=intent, agents=agents or [])])[0]

    def test_database_identifier_is_not_a_chain_state_request(self):
        plan = self.plan('Which on-chain proposal ID is stored in the database?')
        self.assertIn('proposal', plan.agents)
        self.assertNotIn('blockchain', plan.agents)

    def test_explicit_three_source_request_cannot_omit_required_workers(self):
        for noun in ('votes', 'active member assignments'):
            with self.subTest(noun=noun):
                plan = self.plan(f'Report the PDF budget and the database and on-chain {noun}.')
                self.assertTrue({'evidence', 'governance', 'blockchain'} <= set(plan.agents))

    def test_wrong_research_intent_still_collects_requested_sources(self):
        plan = self.plan('Report the PDF budget and database and blockchain vote counts.', 'research')
        self.assertTrue({'evidence', 'governance', 'blockchain'} <= set(plan.agents))
        self.assertLessEqual(len(plan.agents), 4)

    def test_pdf_only_question_does_not_add_live_chain_reads(self):
        plan = self.plan('What does the PDF say about on-chain votes? Use only the PDF.')
        self.assertEqual(plan.agents, ['evidence'])

    def test_proposal_search_topic_is_not_a_live_chain_request(self):
        plan = self.plan('Find proposals about blockchain voting in the database.', 'research')
        self.assertEqual(plan.agents, ['research'])

    def test_valid_semantic_routing_without_explicit_source_constraints_is_preserved(self):
        plan = self.plan('Explain the main risks.', 'analysis', ['evidence', 'proposal'])
        self.assertEqual(plan.agents, ['evidence', 'proposal'])

    def test_stored_status_comparison_still_requires_the_chain(self):
        plan = self.plan('Compare the stored proposal status with its blockchain status.', 'proposal')
        self.assertTrue({'proposal', 'blockchain'} <= set(plan.agents))


class SingleTaskFormatTests(unittest.IsolatedAsyncioTestCase):
    async def compose(self, answer, count=1):
        class Model:
            async def chat(self, *args, **kwargs):
                return answer, 1, {}
        workers = [QuestionResult(question_id=f'q{i}', question=f'Explain item {i}',
            agent='evidence', status='completed', answer='Retrieved supporting source material [D1]',
            citations=['D1'], cited_sources=[CitedSource(source_id='D1', content='The budget is EUR 700.')])
            for i in range(1, count + 1)]
        return await synthesize('Explain the budget', workers, Model(), 'fixture')

    async def test_single_headerless_answer_is_validated_and_used(self):
        result = await self.compose('The budget is EUR 700 [D1].')
        self.assertFalse(result.errors)
        self.assertIn('The budget is EUR 700 [D1].', result.answer)

    async def test_single_headerless_invalid_citation_still_rejected(self):
        result = await self.compose('The budget is EUR 700 [D99].')
        self.assertTrue(result.errors)
        self.assertNotIn('D99', result.answer)

    async def test_single_headerless_invented_currency_still_rejected(self):
        result = await self.compose('The budget is EUR 999 [D1].')
        self.assertTrue(result.errors)
        self.assertNotIn('999', result.answer)

    async def test_multi_task_headerless_answer_is_not_silently_assigned(self):
        result = await self.compose('The budget is EUR 700 [D1].', count=2)
        self.assertTrue(result.errors)

    async def test_wrong_or_duplicate_headers_remain_rejected(self):
        for answer in ('TASK q2:\nEUR 700 [D1].', 'TASK q1:\nEUR 700 [D1].\nTASK q1:\nAgain [D1].'):
            with self.subTest(answer=answer):
                self.assertTrue((await self.compose(answer)).errors)


if __name__ == '__main__':
    unittest.main()
