"""Small client that composes Ollama embedding and chat operations."""

import httpx

from app.model.config.settings import settings
from app.model.entities.results import EmbeddingResult
from .ollama_answers import (
    ABSTENTION, CHAT_TOKEN_BUDGETS, OllamaGenerationError, visible_answer,
)
from .ollama_chat import chat_completion
from .ollama_prompt import SYNTHESIS_PROMPT
from .ollama_embedding import embed_texts, model_digest


class Ollama:
    def __init__(self):
        self.base = settings.ollama_base_url.rstrip("/")
        self.timeout = httpx.Timeout(connect=5, read=300, write=30, pool=5)

    async def digest(self) -> str:
        return await model_digest(self)

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], float, int | None]:
        return await embed_texts(self, texts)

    async def embed_result(self, texts: list[str]) -> EmbeddingResult:
        vectors, latency_ms, input_tokens = await self.embed(texts)
        return EmbeddingResult(settings.ollama_embed_model, len(vectors[0]), vectors,
                               latency_ms, input_tokens)

    async def chat(self, question: str, evidence: str,
                   model: str | None = None) -> tuple[str, float, dict]:
        return await chat_completion(self, question, evidence, model=model)

    async def has_model(self, model: str) -> bool:
        async with httpx.AsyncClient(timeout=self.timeout, trust_env=False) as client:
            response = await client.get(f"{self.base}/api/tags")
            response.raise_for_status()
        return any(model in (item.get("name"), item.get("model"))
                   for item in response.json().get("models", []))

    async def synthesize(self, question: str, evidence: str, model: str | None = None):
        return await chat_completion(self, question, evidence, model=model, system_prompt=SYNTHESIS_PROMPT)



__all__ = ["Ollama", "OllamaGenerationError", "visible_answer",
           "CHAT_TOKEN_BUDGETS", "ABSTENTION"]
