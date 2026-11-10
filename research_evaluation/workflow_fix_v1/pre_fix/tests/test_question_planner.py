"""Regression coverage for preserving intent, amounts, scope and task boundaries."""
import unittest
from unittest.mock import patch
from app.business.agents.question_planner import plan_question_batch, QuestionPlanningError

class FakeOllama:
    base = "http://ollama"
    async def has_model(self, _model): return True

class FakeResponse:
    def __init__(self, content): self.content = content
    def raise_for_status(self): pass
    def json(self): return {"message": {"content": self.content}}

class FakeClient:
    def __init__(self, response): self.response = response
    async def __aenter__(self): return self
    async def __aexit__(self, *_args): pass
    async def post(self, *_args, **_kwargs): return self.response

class QuestionPlannerTests(unittest.IsolatedAsyncioTestCase):
    async def test_numbered_requests_survive_a_planner_timeout(self):
        request = (
            "6.1 Tell me the proposal count and vote count and summarize the PDF and compare the chain records.\n"
            "6.2 EUR 4,500: EUR 2,000, 15000?\n"
            "6.3 Which ones have votes?\n"
            "6.4 Compare those two proposals.\n"
            "6.5 What are the main risks?\n"
            "6.6 List the proposals, list the proposals again, and count all proposals.\n"
            "6.7 How many members voted and how many were assigned and does that match the blockchain?\n"
            "6.8 Check the documents and the voting records and tell me what is missing."
        )
        with patch("app.business.agents.question_planner.httpx.AsyncClient", side_effect=TimeoutError):
            plan = await plan_question_batch(FakeOllama(), [request])
        self.assertEqual(len(plan.questions), 8)
        self.assertEqual(plan.questions[1].question, "EUR 4,500: EUR 2,000, 15000?")
        self.assertIn("evidence", plan.questions[0].agents)
        self.assertIn("blockchain", plan.questions[0].agents)

    async def test_llm_decomposes_compound_request_and_supervisor_obeys_intents(self):
        import json
        from app.business.agents.planning import plan_questions
        tasks = [
            {"question":"List all DAO proposals", "intent":"proposal_count"},
            {"question":"Count total DAO proposals", "intent":"proposal_count"},
            {"question":"Find proposals about governance", "intent":"proposal_count"},
            {"question":"Find proposals about voting", "intent":"proposal_count"},
            {"question":"Summarize PDF and deliverables", "intent":"evidence"},
            {"question":"Count assigned members and recorded database votes by option", "intent":"voting"},
            {"question":"Verify on-chain members and votes against database", "intent":"blockchain"},
            {"question":"Analyze risks, conclusions, missing information and implications", "intent":"analysis", "depends_on":[5,6,7]},
        ]
        response=FakeResponse(json.dumps({"questions":tasks,"needs_clarification":False,"clarification":None}))
        with patch('app.business.agents.question_planner.httpx.AsyncClient',return_value=FakeClient(response)):
            plan=await plan_question_batch(FakeOllama(),'List, count, find, summarize, verify and analyze this initiative.')
        routed=plan_questions([q.question for q in plan.questions],plan.questions)
        self.assertEqual([p.agent for p in routed], ['research']*4+['evidence','governance','blockchain','analysis'])
        self.assertEqual(routed[-1].depends_on,['q5','q6','q7'])
        self.assertEqual(routed[3].agents,['research'])

    async def test_single_budget_request_still_uses_llm_planning(self):
        question='Explain EUR 4,500: EUR 2,000, 15000?'
        response=FakeResponse('{"questions":[{"question":"Explain EUR 4,500: EUR 2,000, 15000?","intent":"evidence"}],"needs_clarification":false,"clarification":null}')
        with patch('app.business.agents.question_planner.httpx.AsyncClient',return_value=FakeClient(response)) as client:
            plan=await plan_question_batch(FakeOllama(),question)
        client.assert_called_once()
        self.assertEqual([q.question for q in plan.questions],[question])

    async def test_invalid_plan_still_routes_an_unnumbered_pdf_and_chain_question(self):
        request = "HI WHAT IS IN PDF? SUMMERIZE THIS PROPOSAL, ? AND COMPARE WITH BLOCKCHAIN"
        response = FakeResponse('{"questions":[],"needs_clarification":false,"clarification":null}')
        with patch("app.business.agents.question_planner.httpx.AsyncClient", return_value=FakeClient(response)):
            plan = await plan_question_batch(FakeOllama(), request)
        self.assertEqual([item.question for item in plan.questions], [request])
        self.assertTrue({"evidence", "blockchain"}.issubset(plan.questions[0].agents))

    async def test_failed_planning_does_not_guess_an_ambiguous_request(self):
        with patch('app.business.agents.question_planner.httpx.AsyncClient',side_effect=RuntimeError('offline')):
            with self.assertRaises(QuestionPlanningError):
                await plan_question_batch(FakeOllama(),'How about that one?')

    async def test_planner_cannot_select_scope(self):
        response=FakeResponse('{"questions":[{"question":"Explain risks","intent":"analysis","dao_id":"other"}],"needs_clarification":false,"clarification":null}')
        with patch('app.business.agents.question_planner.httpx.AsyncClient',return_value=FakeClient(response)):
            with self.assertRaises(QuestionPlanningError):
                await plan_question_batch(FakeOllama(),'Explain risks')

    async def test_empty_input_is_rejected(self):
        with self.assertRaises(QuestionPlanningError):
            await plan_question_batch(FakeOllama(),'')

class ChunkedPlanningTests(unittest.IsolatedAsyncioTestCase):
    async def test_100_questions_are_planned_in_bounded_chunks_with_rebased_dependencies(self):
        import json as jsonlib
        calls = []
        class EchoClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *_args): pass
            async def post(self, _url, json=None, **_kwargs):
                request = jsonlib.loads(json["messages"][1]["content"])["request"]
                calls.append(len(request))
                items = [{"question": q, "intent": "proposal", "depends_on": [1] if i == 1 else []} for i, q in enumerate(request)]
                return FakeResponse(jsonlib.dumps({"questions": items, "needs_clarification": False, "clarification": None}))
        questions = [f"What is the status of check {i}?" for i in range(100)]
        with patch('app.business.agents.question_planner.httpx.AsyncClient', return_value=EchoClient()):
            plan = await plan_question_batch(FakeOllama(), questions)
        self.assertEqual(calls, [20] * 5)
        self.assertEqual([q.question for q in plan.questions], questions)
        self.assertEqual(plan.questions[1].depends_on, [1])
        self.assertEqual(plan.questions[21].depends_on, [21])      # second chunk: local 1 re-based by 20
        self.assertEqual(plan.questions[81].depends_on, [81])

    async def test_a_clarification_in_any_chunk_stops_planning(self):
        import json as jsonlib
        class AskClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *_args): pass
            async def post(self, *_args, **_kwargs):
                return FakeResponse(jsonlib.dumps({"questions": [], "needs_clarification": True, "clarification": "Which proposal?"}))
        with patch('app.business.agents.question_planner.httpx.AsyncClient', return_value=AskClient()):
            plan = await plan_question_batch(FakeOllama(), [f"Question number {i}?" for i in range(30)])
        self.assertTrue(plan.needs_clarification)


class SemanticRoutingTests(unittest.TestCase):
    def test_validated_plan_agents_are_authoritative_not_regex(self):
        from app.business.agents.models import QuestionPlanItem
        from app.business.agents.planning import plan_questions
        q = "Is the PDF budget consistent with the stored proposal?"
        routed = plan_questions([q], [QuestionPlanItem(question=q, intent="evidence", agents=["proposal"])])
        self.assertEqual(routed[0].agents, ["evidence", "proposal"])
        self.assertEqual(routed[0].dropped_agents, [])

    def test_illegal_specialist_is_dropped_and_reported(self):
        from app.business.agents.models import QuestionPlanItem
        from app.business.agents.planning import plan_questions
        q = "List all proposals"
        routed = plan_questions([q], [QuestionPlanItem(question=q, intent="research", agents=["blockchain"])])
        self.assertEqual(routed[0].agents, ["research"])
        self.assertEqual(routed[0].dropped_agents, ["blockchain"])

    def test_question_with_pdf_and_vote_words_is_not_rerouted_by_keywords(self):
        from app.business.agents.models import QuestionPlanItem
        from app.business.agents.planning import plan_questions
        q = "How many votes does the PDF mention?"
        routed = plan_questions([q], [QuestionPlanItem(question=q, intent="voting")])
        self.assertEqual(routed[0].agents, ["governance"])      # regex select_agents would have added evidence

    def test_budget_expression_is_one_task_with_numbers_preserved(self):
        from app.business.agents.models import QuestionPlanItem
        from app.business.agents.planning import plan_questions
        q = "explain me EUR 4,500: EUR 2,000, 15000?"
        routed = plan_questions([q], [QuestionPlanItem(question=q, intent="evidence")])
        self.assertEqual(len(routed), 1)
        self.assertEqual(routed[0].question, q)
        self.assertEqual(routed[0].agents, ["evidence"])

    def test_every_requirement_is_tracked_with_dependencies(self):
        from app.business.agents.models import QuestionPlanItem
        from app.business.agents.planning import plan_questions
        from app.business.agents.requirements import RequirementLedger
        items = [QuestionPlanItem(question="List all proposals", intent="research"),
                 QuestionPlanItem(question="Verify chain votes", intent="blockchain"),
                 QuestionPlanItem(question="Analyze risks of both", intent="analysis", depends_on=[1, 2])]
        routed = plan_questions([i.question for i in items], items)
        ledger = RequirementLedger.from_plans(routed)
        rows = ledger.to_list()
        self.assertEqual([r["id"] for r in rows], ["q1", "q2", "q3"])
        self.assertEqual(rows[2]["depends_on"], ["q1", "q2"])
        self.assertTrue(all(r["required_evidence"] for r in rows))


class MixedRequestRegressionTests(unittest.TestCase):
    def test_search_queries_use_the_topic_not_the_whole_command(self):
        from app.business.agents.planning import proposal_search_query
        self.assertEqual(proposal_search_query('Find proposals about governance.'),'governance')
        self.assertEqual(proposal_search_query('Search this DAO for proposals about voting.'),'voting')
