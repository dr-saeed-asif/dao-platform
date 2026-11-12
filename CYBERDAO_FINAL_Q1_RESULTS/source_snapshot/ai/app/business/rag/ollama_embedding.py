"""Ollama model identity and embedding requests."""

import math
import re
from time import perf_counter

import httpx

from app.model.config.settings import settings

async def model_digest(client) -> str:
    async with httpx.AsyncClient(timeout=client.timeout, trust_env=False) as http:
        response = await http.get(f"{client.base}/api/tags")
        response.raise_for_status()
    for model in response.json().get("models", []):
        if settings.ollama_embed_model in (model.get("name"), model.get("model")):
            digest = model.get("digest", "").lower()
            if re.fullmatch(r"[0-9a-f]{64}", digest): return digest
    raise ValueError(f"Ollama model digest unavailable: {settings.ollama_embed_model}")

async def embed_texts(client, texts: list[str]) -> tuple[list[list[float]], float, int | None]:
    if not texts or any(not isinstance(t, str) or not t.strip() for t in texts):
        raise ValueError("Embedding input is empty.")
    started, vectors, tokens = perf_counter(), [], 0
    async with httpx.AsyncClient(timeout=client.timeout, trust_env=False) as http:
        for offset in range(0, len(texts), 8):
            items, used = await _embed_batch(http, client, texts[offset:offset + 8])
            vectors.extend(_batch(items))
            tokens += used
    return vectors, round((perf_counter() - started) * 1000, 1), tokens

async def _embed_batch(http, client, texts: list[str]) -> tuple[list[list[float]], int]:
    response = await http.post(f"{client.base}/api/embed", json={
        "model": settings.ollama_embed_model, "input": texts, "truncate": False})
    response.raise_for_status()
    result = response.json()
    if result.get("model") != settings.ollama_embed_model:
        raise ValueError("Unexpected Ollama embedding model.")
    items = result.get("embeddings")
    if not isinstance(items, list) or len(items) != len(texts):
        raise ValueError("Ollama returned an unexpected embedding count.")
    return items, result.get("prompt_eval_count") or 0

def _batch(vectors: list[list[float]]) -> list[list[float]]:
    for vector in vectors:
        if not isinstance(vector, list) or len(vector) != 1024 or not all(
                isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
                for v in vector):
            raise ValueError("Invalid embedding; expected 1024 finite dimensions.")
    return vectors
