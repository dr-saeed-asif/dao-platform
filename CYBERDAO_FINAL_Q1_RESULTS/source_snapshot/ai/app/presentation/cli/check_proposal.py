"""Command-line read-only proposal lookup."""

import argparse
import asyncio
import sys

import psycopg
from psycopg_pool import PoolTimeout
from app.model.config.settings import settings
from app.model.database.pool import create_pool
from app.model.database.proposal_queries import get_proposal_in_dao


async def check(dao_id: str, proposal_id: str) -> None:
    pool = create_pool(settings.postgres_url)
    try:
        await pool.open(wait=True, timeout=5)
        proposal = await get_proposal_in_dao(pool, dao_id=dao_id, local_proposal_id=proposal_id)
        _display(proposal)
    except (psycopg.Error, PoolTimeout) as error:
        print("DATABASE_ERROR:", type(error).__name__)
        raise SystemExit(1) from None
    finally:
        await pool.close()


def _display(proposal) -> None:
    if proposal is None:
        print("NOT_FOUND\nNo proposal matched both the local proposal ID and DAO ID.")
        return
    print("FOUND\nProposal data was loaded successfully.")
    for field in ("title", "purpose", "description", "status"):
        print(f"{field.title()} available:", bool(proposal[field]))
    print("Voting dates available:", bool(proposal["startsAt"] and proposal["endsAt"]))


def _args():
    parser = argparse.ArgumentParser(description="Local operator-only proposal read test")
    parser.add_argument("--dao-id", required=True)
    parser.add_argument("--proposal-id", required=True, help="Local proposals.id")
    return parser.parse_args()


def _run(args) -> None:
    coroutine = check(args.dao_id, args.proposal_id)
    asyncio.run(coroutine, loop_factory=asyncio.SelectorEventLoop) if sys.platform == "win32" else asyncio.run(coroutine)


def main() -> None:
    _run(_args())
