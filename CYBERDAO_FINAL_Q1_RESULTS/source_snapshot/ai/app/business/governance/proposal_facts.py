"""Proposal comparison and voting facts from fields actually stored by the DAO."""

from .proposals import get_proposal
from app.model.database.proposal_votes import proposal_vote_facts

UNSUPPORTED_VOTING_FIELDS = ("option_labels", "quorum", "outcome", "voter_list",
                             "verified_on_chain_tally")


async def compare_proposals(pool, dao_id: str, first_id: str,
                            second_id: str) -> dict:
    if first_id == second_id:
        raise ValueError("Comparison requires two different proposal IDs.")
    first = await get_proposal(pool, dao_id, first_id)
    second = await get_proposal(pool, dao_id, second_id)
    fields = ("title", "purpose", "description", "status", "startsAt", "endsAt",
              "totalVotes")
    return {"dao_id": dao_id, "proposal_a": _selected(first, fields),
            "proposal_b": _selected(second, fields)}


async def voting_facts(pool, dao_id: str, proposal_id: str) -> dict:
    proposal = await get_proposal(pool, dao_id, proposal_id)
    votes = await proposal_vote_facts(pool, dao_id, proposal_id)
    return {"dao_id": dao_id, "proposal_id": proposal_id,
            **votes, "proposal_record_total_votes": proposal.get("totalVotes"),
            "source": "public.votes joined through public.proposals",
            "verification": "stored database records; not independently verified on-chain",
            "unsupported_fields": list(UNSUPPORTED_VOTING_FIELDS),
            "unsupported_reason": "On-chain verification, option labels, quorum and outcome are unavailable."}


def _selected(row: dict, fields: tuple[str, ...]) -> dict:
    return {"id": row.get("id"), **{field: row.get(field) for field in fields}}
