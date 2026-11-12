"""DAO-scoped proposal listing and text search use cases."""

from app.model.database.dao_proposals import list_dao_proposals as read_list
from app.model.database.dao_proposals import count_dao_proposals as read_count
from app.model.database.dao_proposals import search_dao_proposals as read_search

MAX_PROPOSAL_RESULTS = 50


def _validate(dao_id: str, limit: int) -> None:
    if not dao_id or not dao_id.strip():
        raise ValueError("DAO ID is required.")
    if not 1 <= limit <= MAX_PROPOSAL_RESULTS:
        raise ValueError("limit must be between 1 and 50.")


async def list_proposals(pool, dao_id: str, limit: int) -> list[dict]:
    _validate(dao_id, limit)
    return await read_list(pool, dao_id, limit)


async def count_proposals(pool, dao_id: str) -> int:
    _validate(dao_id, 1)
    return await read_count(pool, dao_id)


async def search_proposals(pool, dao_id: str, query: str,
                           limit: int) -> list[dict]:
    _validate(dao_id, limit)
    if not query or not query.strip():
        raise ValueError("Search query is required.")
    return await read_search(pool, dao_id, query.strip(), limit)
