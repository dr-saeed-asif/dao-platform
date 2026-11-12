"""Read-only proposal query adapter for the existing DAO schema."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.model.entities.proposal import Proposal


async def get_proposal_in_dao(pool: AsyncConnectionPool, *, dao_id: str,
                              local_proposal_id: str) -> dict[str, Any] | None:
    if not dao_id or not dao_id.strip():
        raise ValueError("DAO ID is required.")
    if not local_proposal_id or not local_proposal_id.strip():
        raise ValueError("Local proposal ID is required.")
    query = """SELECT p.id, p.dao_id, p.on_chain_id, p.chain_id, p.contract_address,
        p.title, p.purpose, p.description, p.status, p.starts_at, p.ends_at,
        (SELECT COUNT(*) FROM public.votes AS v WHERE v.proposal_id = p.id) AS total_votes
        FROM public.proposals AS p WHERE p.id = %s AND p.dao_id = %s LIMIT 1"""
    async with pool.connection(timeout=3) as conn:
        async with conn.cursor(row_factory=dict_row) as cursor:
            await cursor.execute(query, (local_proposal_id, dao_id))
            row = await cursor.fetchone()
    if row is None:
        return None
    return Proposal(**row).as_legacy_dict()
