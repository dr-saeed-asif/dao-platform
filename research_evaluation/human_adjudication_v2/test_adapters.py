"""Offline checks of actual saved adapters with synthetic model/tool responses."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
AI = Path(r"E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server")
os.environ.setdefault("RAG_DEV_TOKEN", "offline-adapter-validation-fixture-token")
sys.path.insert(0, str(AI))
sys.path.insert(0, str(AI / "tests"))
from app.business.agents.models import CitedSource, QuestionResult
from app.business.agents.synthesis import synthesize, CitationRegistry
from app.business.agents.claims import verify_claims, blocking_flags

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

candidate = load("review_candidate_v3", ROOT / "research_evaluation/harness_validation_v1/single_agent_candidate_v3.py")
legacy = load("review_historical_runner", ROOT / "research_evaluation/benchmark_200/scripts/run.py")
CASE = {"question": "Read the permitted fixture value.", "dao": "fixture-dao", "proposal": "fixture-proposal"}


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    def fake_client(self, responses):
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        sent = []
        async def post(url, json):
            sent.append(copy.deepcopy(json))
            reply = MagicMock()
            reply.raise_for_status.return_value = None
            reply.json.return_value = {"message": responses.pop(0)}
            return reply
        client.post = AsyncMock(side_effect=post)
        return client, sent

    async def test_B1_has_no_tool_access_and_no_gold_in_prompt(self):
        client, sent = self.fake_client([{"content": "Fixture answer without data", "tool_calls": []}])
        with patch.object(candidate.httpx, "AsyncClient", return_value=client), patch.object(candidate, "build_tools") as build:
            result = await candidate.run(CASE, object(), False)
        build.assert_not_called()
        self.assertNotIn("tools", sent[0])
        self.assertEqual(json.loads(sent[0]["messages"][1]["content"])["question"], CASE["question"])
        self.assertNotIn("expected_answer", str(sent[0]))
        self.assertEqual(result["sources"], [])

    async def test_B1_unexpected_tool_request_fails(self):
        message = {"content": "", "tool_calls": [{"function": {"name": "forbidden", "arguments": {}}}]}
        client, _ = self.fake_client([message])
        with patch.object(candidate.httpx, "AsyncClient", return_value=client):
            with self.assertRaises(PermissionError):
                await candidate.run(CASE, object(), False)

    async def test_tool_adapter_rejects_cross_dao_before_backend(self):
        tool = MagicMock()
        tool.ainvoke = AsyncMock()
        call = {"function": {"name": "get_proposal", "arguments": {"dao_id": "other"}}}
        client, _ = self.fake_client([{"content": "", "tool_calls": [call]},
                                       {"content": "Denied by tool", "tool_calls": []}])
        with patch.object(candidate.httpx, "AsyncClient", return_value=client),              patch.object(candidate, "build_tools", return_value={"get_proposal": tool}),              patch.object(candidate, "convert_to_openai_tool", return_value={"type": "function"}):
            result = await candidate.run(CASE, object(), True)
        tool.ainvoke.assert_not_awaited()
        self.assertEqual(result["tool_events"][0]["status"], "failed")

    def test_B3_candidate_preserves_structured_business_error(self):
        registry = CitationRegistry()
        reply, status = candidate.tool_reply("get_proposal", {
            "success": False, "error": {"code": "fixture_denied", "message": "Fixture denied"}},
            registry)
        self.assertEqual(reply["error"]["code"], "fixture_denied")
        self.assertEqual(status, "failed")
        self.assertFalse(registry.sources)

    def test_cross_dao_scope_and_direct_proposal_scope(self):
        with self.assertRaises(PermissionError):
            candidate.check_scope(CASE, {"proposal_id": "other"})
        with self.assertRaises(PermissionError):
            candidate.check_scope(CASE, {"dao_id": "other"})
        candidate.check_scope(CASE, {"dao_id": CASE["dao"],
                                     "proposal_a": "same-dao-a", "proposal_b": "same-dao-b"})

    def test_legacy_ablation_restores_patches_after_exception_but_misses_new_alias(self):
        original_refs = legacy.syn.verify_citations
        synthesis_gate = legacy.syn.blocking_flags
        with self.assertRaisesRegex(RuntimeError, "injected"):
            with legacy.ablation(True):
                self.assertIsNot(legacy.syn.verify_citations, original_refs)
                # Confirm the defect in the OLD adapter: its ablation does not
                # remove the newer module-local synthesis claim gate.
                self.assertIs(legacy.syn.blocking_flags, synthesis_gate)
                raise RuntimeError("injected")
        self.assertIs(legacy.syn.verify_citations, original_refs)
        self.assertIs(legacy.syn.blocking_flags, synthesis_gate)

    async def test_B4_current_synthesis_rejects_swapped_numeric_relation(self):
        worker = QuestionResult(question_id="q1", question="Explain fixture budget", agent="evidence",
                                status="completed", answer="Retrieved supporting source material [D1]",
                                citations=["D1"], cited_sources=[CitedSource(source_id="D1",
                                content="Equipment: EUR 2,000; Travel: EUR 500.")])
        class FixtureModel:
            async def chat(self, *args, **kwargs):
                return "TASK q1:\nEquipment budget is EUR 500 [D1].", 0, {}
        result = await synthesize(worker.question, [worker], FixtureModel(), "synthetic-no-network")
        self.assertTrue(result.errors)
        self.assertNotIn("Equipment budget is EUR 500", result.answer)

    def test_ambiguous_gate_result_is_not_automatically_blocked(self):
        result = verify_claims("EUR 500 [D1]", [
            {"source_id": "D1", "content": "Equipment: EUR 500; Travel: EUR 500"}])
        self.assertEqual(result["counts"], {"unchecked_cited": 1})
        self.assertEqual(blocking_flags(result), [])

    def test_historical_B2_is_tool_using_and_new_conditions_are_still_pending(self):
        data = json.loads((ROOT / "research_evaluation/ai_independent_part2_v1/PROPOSED_CONDITIONS.json").read_text())
        self.assertIn("tools", data["historical_definitions"]["B2"])
        self.assertEqual(data["new_definitions"]["B2"]["tools"], False)
        self.assertIn("not implemented", data["new_definitions"]["B2"]["implementation_status"])
        self.assertIn("not implemented", data["new_definitions"]["A1"]["implementation_status"])
        self.assertIn("not implemented", data["new_definitions"]["A2"]["implementation_status"])
        self.assertIn("not implemented", data["new_definitions"]["A4"]["implementation_status"])


if __name__ == "__main__":
    unittest.main()
