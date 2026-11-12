"""DAO-validated proposal search over matching linked PDF indexes."""

import re
from pathlib import Path
from functools import partial
from app.model.database.proposal_artefacts import linked_artefacts
from app.business.rag.indexing import index_document
from .document_sync import sync_record
from .evidence import verified_pdf_record, normalized_sha256
from time import perf_counter

from app.model.config.settings import settings
from app.model.database.proposal_queries import get_proposal_in_dao
from app.business.rag.proposal_search import search_proposal_indexes
from .proposal_scope import proposal_scope
from .proposals import ProposalNotFound


async def search_proposal(pool, ollama, question: str, dao_id: str,
                          proposal_id: str, top_k: int, profile_id: str | None) -> dict:
    started = perf_counter()
    if await get_proposal_in_dao(pool, dao_id=dao_id, local_proposal_id=proposal_id) is None:
        raise ProposalNotFound("Proposal not found in the selected DAO.")
    scope = await proposal_scope(pool, dao_id, proposal_id, profile_id=profile_id,
                                 ollama=ollama)
    indexing_ms = 0.0
    if (settings.dao_artefact_storage_dir and profile_id is None
            and len(scope["indexes"]) < scope["linked_pdf_count"]):
        indexing_started = perf_counter()
        ready = {item["document_sha256"] for item in scope["indexes"]}
        records = await linked_artefacts(pool, dao_id, proposal_id)
        for record in records:
            valid, _ = verified_pdf_record(record)
            if valid and normalized_sha256(record.get("computed_hash")) not in ready:
                await sync_record(partial(index_document, pool, ollama),
                                  Path(settings.dao_artefact_storage_dir), record)
        scope = await proposal_scope(pool, dao_id, proposal_id, ollama=ollama)
        indexing_ms = round((perf_counter() - indexing_started) * 1000, 1)
    exhaustive_docs = _asks_about_deadlines(question)
    embed_ms, tokens, evidence = 0.0, 0, []
    if scope["indexes"]:
        vectors, embed_ms, tokens = await ollama.embed([question])
        evidence = await search_proposal_indexes(pool, scope["indexes"], vectors[0], top_k,
                                                 cover_each_index=exhaustive_docs)
    return {"dao_id": dao_id, "proposal_id": proposal_id, "profile_id": scope["profile_id"],
        "documents": scope["documents"], "linked_pdf_count": scope["linked_pdf_count"],
        "excluded_artefacts": scope["excluded"], "evidence": evidence,
        "indexing_ms": indexing_ms, "embedding_ms": embed_ms, "retrieval_ms": round((perf_counter() - started) * 1000, 1),
        "embedding_tokens": tokens}


def _asks_about_deadlines(question: str) -> bool:
    return bool(re.search(r"\b(deadlines?|due dates?|due by|no later than|submit by|submission dates?|when is .* due)\b",
                          question, re.IGNORECASE))
