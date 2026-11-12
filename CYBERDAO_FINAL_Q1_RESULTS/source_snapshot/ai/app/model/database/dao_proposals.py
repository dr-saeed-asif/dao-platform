"""Bounded, parameterized reads from the authoritative public.proposals table."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.model.entities.proposal import Proposal


async def list_dao_proposals(pool: AsyncConnectionPool, dao_id: str,
                             limit: int) -> list[dict[str, Any]]:
    query = _select() + " WHERE dao_id = %s ORDER BY id LIMIT %s"
    return await _fetch(pool, query, (dao_id, limit))


async def count_dao_proposals(pool: AsyncConnectionPool, dao_id: str) -> int:
    if not dao_id or not dao_id.strip():
        raise ValueError("DAO ID is required.")
    async with pool.connection(timeout=3) as conn:
        async with conn.cursor() as cursor:
            await cursor.execute("SET LOCAL statement_timeout = '2500ms'")
            await cursor.execute(
                "SELECT COUNT(*) FROM public.proposals WHERE dao_id = %s",
                (dao_id,),
            )
            row = await cursor.fetchone()
    return int(row[0])


async def search_dao_proposals(pool: AsyncConnectionPool, dao_id: str,
                               query_text: str, limit: int) -> list[dict[str, Any]]:
    query = _select() + " WHERE dao_id = %s AND (title ILIKE %s OR purpose ILIKE %s " \
        "OR description ILIKE %s) ORDER BY id LIMIT %s"
    pattern = f"%{query_text}%"
    return await _fetch(pool, query, (dao_id, pattern, pattern, pattern, limit))


def _select() -> str:
    return ("SELECT id, dao_id, on_chain_id, chain_id, contract_address, title, purpose, "
            "description, status, starts_at, ends_at, total_votes FROM public.proposals")


async def _fetch(pool, query: str, params: tuple) -> list[dict[str, Any]]:
    async with pool.connection(timeout=3) as conn:
        async with conn.cursor(row_factory=dict_row) as cursor:
            await cursor.execute("SET LOCAL statement_timeout = '2500ms'")
            await cursor.execute(query, params)
            rows = await cursor.fetchall()
    return [Proposal(**row).as_legacy_dict() for row in rows]
