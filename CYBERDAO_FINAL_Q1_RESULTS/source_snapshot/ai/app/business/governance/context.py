"""Combine authoritative proposal records with verified linked PDF context."""

import json

from app.model.database.proposal_queries import get_proposal_in_dao
from app.model.database.proposal_votes import proposal_vote_facts
from app.model.entities.evidence import Evidence


def pdf_context(evidence: list[dict]) -> list[str]:
    return [f"[{item['source_id']}] Verified linked PDF '{item['filename']}', "
        f"artefact {item['artefact_evidence_id']}, page {item['page_number']}, "
        f"chunk {item['chunk_index']}:\n{item['content']}" for item in evidence]


async def add_governance_context(pool, question_scope: dict, evidence: list[dict],
                                 parts: list[str]) -> dict:
    proposal = await get_proposal_in_dao(pool, dao_id=question_scope["dao_id"],
        local_proposal_id=question_scope["proposal_id"])
    if proposal is None:
        raise ValueError("Proposal is no longer present in the DAO.")
    evidence.insert(0, Evidence("G1", proposal, source="governance-db",
                                metadata=question_scope).as_dict())
    parts.insert(0, "[G1] Authoritative proposal record:\n" +
                 json.dumps(proposal, ensure_ascii=False, default=str))
    votes = await proposal_vote_facts(pool, question_scope["dao_id"],
                                      question_scope["proposal_id"])
    evidence.insert(1, Evidence("G2", votes, source="governance-votes",
                                metadata=question_scope).as_dict())
    parts.insert(1, "[G2] Stored proposal vote rows; not independently verified on-chain:\n" +
                 json.dumps(votes, ensure_ascii=False, default=str))
    return proposal
