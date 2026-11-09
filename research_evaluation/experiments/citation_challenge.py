"""Controlled challenge. Actual verification code with scripted model and source responses."""
import asyncio
import json
from pathlib import Path

from app.business.agents.claims import verify_claims
from app.business.agents.quality import verify_citations
from test_agent_workflow import FakeOllama, workflow

ROOT = Path(__file__).resolve().parents[1]


class ScriptedWriter(FakeOllama):
    def __init__(self, outputs):
        super().__init__()
        self.outputs = iter(outputs)

    async def chat(self, question, context, model=None):
        return next(self.outputs), 0, {}


async def main():
    source = [{"source_id": "G1", "content": '{"stored_total_votes": 0, "assigned_members": 10}'}]
    cases = [
        ("valid_zero", "The database recorded 0 votes [G1].", True),
        ("invalid_id", "The database recorded 0 votes [G99].", False),
        ("mixed_ids", "The database recorded 0 votes [G1][D77].", False),
        ("no_reference", "The database recorded 0 votes.", False),
        ("wrong_value", "The database recorded 25 votes [G1].", True),
        ("wrong_field_existing_number", "The database recorded 10 votes [G1].", True),
        ("contradictory_availability", "The vote count is unavailable [G1].", True),
        ("unsupported_prose", "The proposal was cancelled by the chair [G1].", True),
    ]
    checks = [{"case": key, "answer": answer, "expected_structural_valid": expected,
               "structural": verify_citations(answer, source),
               "automatic_claims": verify_claims(answer, source)}
              for key, answer, expected in cases]
    repairs = []
    for key, answers in [
        ("repairable_id", ["Fact [G99].", "Fact [G1]."]),
        ("persistent_id", ["Fact [G99].", "Fact [G99]."]),
        ("valid_first_pass", ["Fact [G1]."]),
    ]:
        graph, _, _ = workflow(ollama=ScriptedWriter(answers), max_retries=2)
        result = (await graph.run(["What is the proposal status?"], dao_id="fixture", proposal_id="fixture")).results[0]
        repairs.append({"case": key, "scripted_outputs": answers, "status": result.status,
                        "attempts": result.attempts, "citations": result.citations,
                        "spans": [s for s in result.execution["trace"] if s["kind"] == "citation_check"]})
    (ROOT / "raw_results/citation-challenge.json").write_text(
        json.dumps({"fixture_source": source, "checks": checks, "repairs": repairs}, indent=2), encoding="utf8")
    print(f"{len(checks)} challenge cases and {len(repairs)} scripted repair runs")


if __name__ == "__main__":
    asyncio.run(main())
