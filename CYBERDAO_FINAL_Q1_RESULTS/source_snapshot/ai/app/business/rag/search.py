"""Standalone PDF search use case; proposal retrieval lives in governance."""

from time import perf_counter

from app.model.config.settings import settings


async def search_document(pool, ollama, store, question: str, digest: str, top_k: int) -> dict:
    started = perf_counter()
    index_id, profile_id = await store.ready_index(digest)
    vectors, embed_ms, tokens = await ollama.embed([question])
    evidence = await store.search(index_id, vectors[0], top_k)
    return {"document_sha256": digest, "profile_id": profile_id,
        "model": settings.ollama_embed_model, "evidence": evidence,
        "embedding_ms": embed_ms, "retrieval_ms": round((perf_counter() - started) * 1000, 1),
        "embedding_tokens": tokens}


__all__ = ["search_document"]
