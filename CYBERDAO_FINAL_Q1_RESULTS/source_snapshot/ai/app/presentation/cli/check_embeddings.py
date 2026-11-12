"""Command-line entrypoint for local embedding verification."""

import argparse
import asyncio
import sys

from .check_embeddings_run import check_embeddings


def _args():
    parser = argparse.ArgumentParser(description="Verify Ollama PDF and question embeddings")
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--question", default="What are the main objectives and risks?")
    return parser.parse_args()


def _run(args) -> None:
    coroutine = check_embeddings(args.pdf, args.question)
    if sys.platform == "win32": asyncio.run(coroutine, loop_factory=asyncio.SelectorEventLoop)
    else: asyncio.run(coroutine)


def main() -> None:
    try:
        _run(_args())
    except Exception as error:
        print("\nFAILED:", type(error).__name__, "\nReason:", str(error))
        raise SystemExit(1) from None
