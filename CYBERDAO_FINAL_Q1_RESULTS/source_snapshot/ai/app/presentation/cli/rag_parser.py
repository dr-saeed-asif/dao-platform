"""Argument parser for the established local RAG CLI commands."""

import argparse


def _scope(parser, *, question=True, mode=False):
    parser.add_argument("--dao-id", required=True)
    parser.add_argument("--proposal-id", required=True)
    if question:
        parser.add_argument("--question", required=True)
        parser.add_argument("--top-k", type=int, default=4)
        parser.add_argument("--profile-id")
    if mode: parser.add_argument("--system", choices=["hybrid", "vector-rag"], default="hybrid")


def build_parser():
    parser = argparse.ArgumentParser(description="Local CyberDAO proposal and PDF RAG")
    subs = parser.add_subparsers(dest="command", required=True)
    _add_pdf_commands(subs)
    _add_proposal_commands(subs)
    subs.add_parser("list")
    runs = subs.add_parser("runs", help="Inspect recent AI evaluation runs")
    runs.add_argument("--limit", type=int, default=20)
    return parser


def _add_pdf_commands(subs) -> None:
    one = subs.add_parser("index", help="Index a single local PDF")
    one.add_argument("--pdf", required=True)
    folder = subs.add_parser("index-folder", help="Index up to 25 PDFs")
    folder.add_argument("--folder", required=True)
    for name in ("search", "ask"):
        cmd = subs.add_parser(name)
        cmd.add_argument("--sha256", required=True)
        cmd.add_argument("--question", required=True)
        cmd.add_argument("--top-k", type=int, default=4)


def _add_proposal_commands(subs) -> None:
    _scope(subs.add_parser("proposal", help="Hybrid proposal answer"), mode=True)
    _scope(subs.add_parser("proposal-ask", help="Hybrid/vector-rag answer"), mode=True)
    _scope(subs.add_parser("proposal-search", help="Search linked PDFs"))
    _scope(subs.add_parser("proposal-documents", help="Inspect DAO links"), question=False)
    sync = subs.add_parser("sync-proposal", help="Index verified linked source PDFs")
    _scope(sync, question=False)
    sync.add_argument("--storage-root", required=True)
