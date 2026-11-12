"""Command-line check for one proposal assignment."""

import argparse
import asyncio
import sys

from app.model.config.settings import settings
from app.model.database.membership import is_proposal_member
from app.model.database.pool import create_pool


async def check(dao_id: str, proposal_id: str, wallet_address: str) -> None:
    pool = create_pool(settings.postgres_url)
    try:
        await pool.open(wait=True, timeout=5)
        assigned = await is_proposal_member(pool, dao_id=dao_id,
            proposal_id=proposal_id, wallet_address=wallet_address)
        print("ASSIGNED" if assigned else "NOT_ASSIGNED")
        print("A current assignment exists in PostgreSQL." if assigned else
              "No matching current assignment was found.")
    finally:
        await pool.close()


def _args():
    parser = argparse.ArgumentParser(description="Local proposal assignment test")
    for field in ("dao-id", "proposal-id", "wallet"):
        parser.add_argument(f"--{field}", required=True)
    return parser.parse_args()


def _run(args) -> None:
    coroutine = check(args.dao_id, args.proposal_id, args.wallet)
    if sys.platform == "win32": asyncio.run(coroutine, loop_factory=asyncio.SelectorEventLoop)
    else: asyncio.run(coroutine)


def main() -> None:
    _run(_args())
