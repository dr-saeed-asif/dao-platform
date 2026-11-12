"""Coordinate RAG use cases with database adapters."""

from pathlib import Path

from app.business.rag.indexing import index_document
from app.business.rag.ollama_client import Ollama
from app.model.database.chunks import search_chunks
from app.model.database.documents import list_documents
from app.model.database.indexes import ready_index
from app.model.database.proposal_artefacts import artefacts_for_hash
from app.business.governance.current_evidence import current_evidence
from app.business.governance.evidence import normalized_sha256


class RagStore:
    def __init__(self, pool, ollama: Ollama):
        self.pool = pool
        self.ollama = ollama

    async def index(self, path: Path) -> dict:
        return await index_document(self.pool, self.ollama, path)

    async def ready_index(self, digest: str) -> tuple[int, str]:
        normalized = normalized_sha256(digest)
        if normalized is None:
            raise ValueError("Invalid document digest.")
        for record in await artefacts_for_hash(self.pool, normalized):
            valid, reason = await current_evidence(self.pool, record)
            if not valid:
                raise ValueError(reason)
        return await ready_index(self.pool, normalized, await self.ollama.digest())

    async def search(self, index_id: int, vector: list[float], top_k: int) -> list[dict]:
        return await search_chunks(self.pool, index_id, vector, top_k)

    async def documents(self) -> list[dict]:
        return await list_documents(self.pool)
