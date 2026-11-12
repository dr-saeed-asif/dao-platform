"""Build the established frontend response envelope for proposal answers."""

from uuid import uuid4

from app.model.config.settings import settings


def result_payload(found, evidence, answer, mode, top_k, tokens, generation_ms,
                   elapsed, dao_id, proposal_id) -> dict:
    return {"runId": str(uuid4()), "system": mode, "answer": answer,
        "models": {"chat": f"ollama:{settings.ollama_chat_model}",
        "embedding": f"ollama:{settings.ollama_embed_model}", "embeddingDimension": 1024},
        "evidence": evidence, "retrieval": {"method": "cosine+governance" if mode == "hybrid" else "cosine",
        "topK": top_k, "profile_id": found["profile_id"]}, "latencyMs": elapsed,
        "retrievalLatencyMs": found["retrieval_ms"], "generationLatencyMs": generation_ms,
        "embeddingLatencyMs": found["embedding_ms"], "tokens": tokens,
        "_embedding_tokens": found.get("embedding_tokens"),
        "scope": {"dao_id": dao_id, "proposal_id": proposal_id, "document_sha256": None},
        "documents": found["documents"],
        "note": "Local operator-only; generated citations are not claim-verified."}
