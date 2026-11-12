"""Argument and event-loop handling for the live frontend smoke check."""

import argparse
import asyncio
import sys

from .frontend_smoke import smoke


def _args():
    parser = argparse.ArgumentParser(description="CyberDAO operator-only API smoke test")
    parser.add_argument("--dao-id", required=True)
    parser.add_argument("--proposal-id", required=True)
    return parser.parse_args()


def _run(args) -> None:
    coroutine = smoke(args.dao_id, args.proposal_id)
    if sys.platform == "win32": asyncio.run(coroutine, loop_factory=asyncio.SelectorEventLoop)
    else: asyncio.run(coroutine)


def main() -> None:
    try:
        _run(_args())
    except Exception as exc:
        print(f"FAILED: {type(exc).__name__}: {exc}")
        raise SystemExit(1) from None
