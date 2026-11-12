"""Dispatch one parsed local RAG command."""

from . import rag_governance_commands as governance
from . import rag_index_commands as indexing
from . import rag_query_commands as query
from .rag_output import dump
from app.model.database.evaluations import list_runs


async def dispatch(args, pool, rag) -> None:
    command = args.command
    if command == "index": return await indexing.index_one(rag, args.pdf)
    if command == "index-folder": return await indexing.index_folder(rag, args.folder)
    if command == "search": return await query.search(rag, args)
    if command == "ask": return await query.ask(rag, args)
    if command in ("proposal", "proposal-ask"): return await query.proposal_answer(rag, args)
    if command == "proposal-search": return await query.proposal_search(rag, args)
    if command == "proposal-documents":
        return await governance.proposal_documents(pool, args.dao_id, args.proposal_id)
    if command == "sync-proposal":
        return await governance.sync_proposal(rag, pool, args.dao_id,
                                             args.proposal_id, args.storage_root)
    if command == "list": return dump(await rag.store.documents())
    if command == "runs": return dump(await list_runs(pool, args.limit))
