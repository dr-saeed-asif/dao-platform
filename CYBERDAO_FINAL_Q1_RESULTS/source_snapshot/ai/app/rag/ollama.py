"""Compatibility imports for the local Ollama client."""

from app.business.rag.ollama_client import (
    ABSTENTION, CHAT_TOKEN_BUDGETS, Ollama, OllamaGenerationError, visible_answer,
)

__all__ = ["Ollama", "OllamaGenerationError", "visible_answer",
           "CHAT_TOKEN_BUDGETS", "ABSTENTION"]
