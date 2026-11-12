"""Local Ollama health probe."""

from time import perf_counter

import httpx

from app.model.config.settings import settings


async def check_ollama() -> dict:
    started = perf_counter()
    error = None
    try:
        async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
            response = await client.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags")
            response.raise_for_status()
        names = {item["name"] for item in response.json()["models"]}
        missing = [name for name in (settings.ollama_chat_model, settings.ollama_embed_model)
                   if name not in names]
        if missing:
            error = "Missing Ollama models: " + ", ".join(missing)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        error = "Could not reach Ollama or read its model list."
    return {"status": "unhealthy" if error else "healthy",
            "latencyMs": round((perf_counter() - started) * 1000, 2),
            "model": settings.ollama_chat_model, "error": error}
