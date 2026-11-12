"""Proposal-scoped grounded answer use case."""

from time import perf_counter
import re

from .answer_result import result_payload
from .context import add_governance_context, pdf_context
from .retrieval import search_proposal


async def answer_proposal(pool, ollama, question: str, dao_id: str,
                          proposal_id: str, top_k: int, mode: str,
                          profile_id: str | None, search_use_case=None) -> dict:
    if mode not in ("hybrid", "vector-rag"):
        raise ValueError("Supported proposal modes: hybrid, vector-rag.")
    started = perf_counter()
    found = await (search_use_case or search_proposal)(question, dao_id=dao_id,
        proposal_id=proposal_id, top_k=top_k, profile_id=profile_id)
    evidence, parts = found["evidence"], pdf_context(found["evidence"])
    if mode == "hybrid":
        proposal = await add_governance_context(pool,
            {"dao_id": dao_id, "proposal_id": proposal_id}, evidence, parts)
    else:
        proposal = None
    vote_facts = _vote_facts(evidence)
    if proposal and vote_facts is not None and _asks_vote_count(question):
        answer = (f"The database contains {vote_facts['stored_total_votes']} stored vote records; "
                  "they are not independently verified on-chain. [G2]")
        generation_ms, tokens = 0.0, {
            "input_tokens": 0, "output_tokens": 0, "generation_attempts": 0}
    else:
        answer, generation_ms, tokens = await _generate(ollama, question, parts)
    return result_payload(found, evidence, answer, mode, top_k, tokens, generation_ms,
        round((perf_counter() - started) * 1000, 1), dao_id, proposal_id)


def _asks_vote_count(question: str) -> bool:
    return bool(re.search(r"\b(?:how many votes|number of votes|vote count)\b",
                          question, re.IGNORECASE))


def _vote_facts(evidence: list[dict]) -> dict | None:
    return next((item["content"] for item in evidence
                 if item.get("source_id") == "G2"), None)


async def _generate(ollama, question: str, parts: list[str]) -> tuple[str, float, dict]:
    if parts:
        return await ollama.chat(question, "\n\n".join(parts))
    return "No indexed, verified PDFs are linked to this proposal.", 0.0, {
        "input_tokens": 0, "output_tokens": 0, "generation_attempts": 0}


