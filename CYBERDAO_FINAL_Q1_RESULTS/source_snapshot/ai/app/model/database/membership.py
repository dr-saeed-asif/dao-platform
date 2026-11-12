"""Read-only proposal assignment query adapter."""

import re

from psycopg_pool import AsyncConnectionPool

WALLET_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")


async def is_proposal_member(pool: AsyncConnectionPool, *, dao_id: str,
                             proposal_id: str, wallet_address: str) -> bool:
    if not dao_id or not dao_id.strip():
        raise ValueError("DAO ID is required.")
    if not proposal_id or not proposal_id.strip():
        raise ValueError("Proposal ID is required.")
    if not WALLET_PATTERN.fullmatch(wallet_address):
        raise ValueError("Invalid wallet address.")
    query = "SELECT ai.is_proposal_member(%s, %s, %s)"
    async with pool.connection(timeout=3) as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(query, (dao_id, proposal_id, wallet_address.lower()))
            row = await cursor.fetchone()
    return bool(row[0]) if row else False
