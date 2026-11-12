"""Command-line entrypoint preserving the local RAG CLI interface."""

import asyncio
import sys
from .rag_cli_run import execute
from .rag_parser import build_parser


def _validate(parser, args) -> None:
    if not 1 <= getattr(args, "top_k", 4) <= 8:
        parser.error("--top-k must be between 1 and 8")
    if not 1 <= getattr(args, "limit", 1) <= 100:
        parser.error("--limit must be between 1 and 100")


def _run(args) -> None:
    command = execute(args)
    if sys.platform == "win32": asyncio.run(command, loop_factory=asyncio.SelectorEventLoop)
    else: asyncio.run(command)


def _args():
    parser = build_parser()
    args = parser.parse_args()
    _validate(parser, args)
    return args


def _safe_run(args) -> None:
    try:
        _run(args)
    except Exception as exc:
        print(f"FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1) from None


def main() -> None:
    _safe_run(_args())


if __name__ == "__main__":
    main()
