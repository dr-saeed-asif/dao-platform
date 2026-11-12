"""Proposal reads and assignment diagnostics scoped to one DAO."""

from app.model.database.membership import is_proposal_member
from app.model.database.proposal_queries import get_proposal_in_dao


class ProposalNotFound(ValueError):
    """The proposal does not exist in the requested DAO."""


async def get_proposal(pool, dao_id: str, proposal_id: str) -> dict:
    proposal = await get_proposal_in_dao(pool, dao_id=dao_id,
                                         local_proposal_id=proposal_id)
    if proposal is None:
        raise ProposalNotFound("Proposal not found in the selected DAO.")
    return proposal


async def check_assignment(pool, dao_id: str, proposal_id: str,
                           wallet_address: str) -> bool:
    await get_proposal(pool, dao_id, proposal_id)
    return await is_proposal_member(pool, dao_id=dao_id,
        proposal_id=proposal_id, wallet_address=wallet_address)
