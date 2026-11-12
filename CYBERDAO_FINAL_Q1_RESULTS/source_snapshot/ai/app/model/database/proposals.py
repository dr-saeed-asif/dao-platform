"""Proposal database lookups used by compatibility services."""

from psycopg_pool import AsyncConnectionPool


async def resolve_dao_id(pool: AsyncConnectionPool, proposal_id: str,
                         supplied: str | None) -> str:
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT dao_id FROM public.proposals WHERE id = %s", (proposal_id,)
            )
            row = await cur.fetchone()
    if not row or (supplied and supplied != row[0]):
        raise ValueError("Proposal does not exist in the requested DAO.")
    return row[0]
