"""Search and answer commands for the local RAG CLI."""

from .rag_output import dump


async def search(rag, args) -> None:
    dump(await rag.search(args.question, args.sha256, args.top_k))


async def ask(rag, args) -> None:
    dump(await rag.ask(args.question, document_sha256=args.sha256, top_k=args.top_k))


async def proposal_answer(rag, args) -> None:
    dump(await rag.ask_proposal(args.question, dao_id=args.dao_id,
        proposal_id=args.proposal_id, top_k=args.top_k, mode=args.system,
        profile_id=args.profile_id))


async def proposal_search(rag, args) -> None:
    dump(await rag.search_proposal(args.question, dao_id=args.dao_id,
        proposal_id=args.proposal_id, top_k=args.top_k, profile_id=args.profile_id))
