"""Backward-compatible local answer use case for PDF and proposal scope."""

from time import perf_counter
from uuid import uuid4

from app.business.governance.answers import answer_proposal
from .search import search_document


async def answer_question(pool, ollama, store, question: str, document_sha256: str | None,
                          dao_id: str | None, proposal_id: str | None, top_k: int) -> dict:
    if document_sha256 and (dao_id or proposal_id):
        raise ValueError("Choose standalone PDF or DAO proposal scope, not both.")
    if not document_sha256:
        if not dao_id or not proposal_id:
            raise ValueError("Specify document_sha256 OR dao_id + proposal_id.")
        async def scoped_search(query, **scope):
            from app.business.governance.retrieval import search_proposal
            return await search_proposal(pool, ollama, query, **scope)

        return await answer_proposal(pool, ollama, question, dao_id, proposal_id,
                                     top_k, "hybrid", None, scoped_search)
    started = perf_counter()
    found = await search_document(pool, ollama, store, question, document_sha256, top_k)
    evidence = found["evidence"]
    context = "\n\n".join(f"[{item['source_id']}] PDF page {item['page_number']}, "
        f"chunk {item['chunk_index']}:\n{item['content']}" for item in evidence)
    answer, generation_ms, tokens = await ollama.chat(question, context)
    return standalone_result(found, evidence, answer, top_k, generation_ms, tokens,
                             round((perf_counter() - started) * 1000, 1))


def standalone_result(found, evidence, answer, top_k, generation_ms, tokens, elapsed) -> dict:
    return {"runId": str(uuid4()), "system": "vector-rag", "answer": answer,
        "evidence": evidence, "retrieval": {"method": "cosine", "topK": top_k,
        "profile_id": found["profile_id"]}, "latencyMs": elapsed,
        "retrievalLatencyMs": found["retrieval_ms"], "generationLatencyMs": generation_ms,
        "embeddingLatencyMs": found["embedding_ms"], "tokens": tokens,
        "_embedding_tokens": found.get("embedding_tokens"),
        "scope": {"document_sha256": found["document_sha256"], "dao_id": None,
        "proposal_id": None}, "note": "Local operator-only; generated citations are not claim-verified."}
