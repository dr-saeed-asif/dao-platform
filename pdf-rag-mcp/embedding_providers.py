import os
from abc import ABC, abstractmethod
from typing import List

from dotenv import load_dotenv

load_dotenv()


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return the embedding dimension."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name."""
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name."""
        pass

    @abstractmethod
    def embed(self, texts: List[str], input_type: str = "document") -> List[List[float]]:
        """Generate embeddings for a list of texts."""
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query text."""
        pass


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Ollama local embedding provider."""

    def __init__(self):
        from ollama import Client

        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        self.model = os.getenv("OLLAMA_EMBED_MODEL", "qwen3-embedding:0.6b")
        self._dimension = int(os.getenv("OLLAMA_EMBED_DIMENSION", "1024"))
        self.client = Client(host=self.base_url, timeout=180.0)

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return self.model

    @property
    def provider_name(self) -> str:
        return "Ollama"

    def embed(self, texts: List[str], input_type: str = "document") -> List[List[float]]:
        response = self.client.embed(
            model=self.model,
            input=texts,
            keep_alive="30m"
        )
        return [list(emb) for emb in response.embeddings]

    def embed_query(self, text: str) -> List[float]:
        response = self.client.embed(
            model=self.model,
            input=text,
            keep_alive="30m"
        )
        return list(response.embeddings[0])


class VoyageEmbeddingProvider(EmbeddingProvider):
    """Voyage AI cloud embedding provider."""

    def __init__(self):
        import voyageai

        self.api_key = os.getenv("VOYAGE_API_KEY")
        if not self.api_key or self.api_key == "your-voyage-api-key-here":
            raise ValueError("VOYAGE_API_KEY not set in environment")

        self.model = os.getenv("VOYAGE_EMBED_MODEL", "voyage-3.5")
        self._dimension = int(os.getenv("VOYAGE_EMBED_DIMENSION", "1024"))
        self.client = voyageai.Client(api_key=self.api_key)

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return self.model

    @property
    def provider_name(self) -> str:
        return "Voyage AI"

    def embed(self, texts: List[str], input_type: str = "document") -> List[List[float]]:
        result = self.client.embed(
            texts=texts,
            model=self.model,
            input_type=input_type
        )
        return result.embeddings

    def embed_query(self, text: str) -> List[float]:
        result = self.client.embed(
            texts=[text],
            model=self.model,
            input_type="query"
        )
        return result.embeddings[0]


def get_embedding_provider() -> EmbeddingProvider:
    """Factory function to get the configured embedding provider.
    
    IS_ACTIVE values (case-insensitive):
      - "ollama", "local", "false" -> Ollama (local embeddings)
      - "voyage", "voyage ai", "voyageai", "true" -> Voyage AI (cloud embeddings)
    """
    import logging
    logger = logging.getLogger(__name__)
    
    provider_input = os.getenv("IS_ACTIVE", "ollama").lower().strip()
    
    voyage_keys = {"voyage", "voyage ai", "voyageai", "true"}
    ollama_keys = {"ollama", "local", "false"}
    
    if provider_input in voyage_keys:
        return VoyageEmbeddingProvider()
    elif provider_input in ollama_keys:
        return OllamaEmbeddingProvider()
    else:
        logger.warning("Unknown IS_ACTIVE='%s', defaulting to Ollama", provider_input)
        return OllamaEmbeddingProvider()