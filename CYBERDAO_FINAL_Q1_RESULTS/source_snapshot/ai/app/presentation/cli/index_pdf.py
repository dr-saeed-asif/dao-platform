"""Legacy single-PDF indexing command output and entrypoint."""

import argparse
import asyncio
import sys

from app.business.rag.legacy_indexing import index_pdf as index_document


async def index_pdf(filename: str) -> None:
    result = await index_document(filename, _show_embedding_progress)
    if result["status"] == "ALREADY_INDEXED":
        print(f"ALREADY_INDEXED: {result['message']}")
        return
    print("\nINDEXED: PDF vectors saved successfully.")
    print("Document SHA-256:", result["sha256"])
    print("Profile ID:", result["profile_id"])
    print("Pages:", result["pages"])
    print("Stored chunks:", result["chunks"])
    print("Vector dimensions:", result["dimensions"])
    print("Embedding latency (ms):", result["embedding_ms"])


def _show_embedding_progress(count: int, model: str) -> None:
    print(f"Embedding {count} PDF chunks with {model}...")


def _args():
    parser = argparse.ArgumentParser(description="Local PDF-to-pgvector indexing test")
    parser.add_argument("--pdf", required=True)
    return parser.parse_args()


def _run(filename: str) -> None:
    coroutine = index_pdf(filename)
    if sys.platform == "win32": asyncio.run(coroutine, loop_factory=asyncio.SelectorEventLoop)
    else: asyncio.run(coroutine)


def main() -> None:
    args = _args()
    try:
        _run(args.pdf)
    except Exception as error:
        print("FAILED:", type(error).__name__, str(error))
        raise SystemExit(1) from None
