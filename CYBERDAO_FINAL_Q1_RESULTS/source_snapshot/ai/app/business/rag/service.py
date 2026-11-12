"""Compose RAG indexing, retrieval, and answer use cases."""

from app.business.evaluation.recorder import RunRecorder
from app.business.evaluation.workflow import record_answer
from app.business.governance.answers import answer_proposal
from app.business.governance.retrieval import search_proposal
from app.business.rag.answers import answer_question
from app.business.rag.ollama_client import Ollama
from app.business.rag.search import search_document
from app.business.rag.store import RagStore
from app.model.database.interfaces import DatabasePool


class RagService:
    def __init__(self, pool: DatabasePool):
        self.pool = pool
        self.recorder = RunRecorder(pool)
        self.ollama = Ollama()
        self.store = RagStore(pool, self.ollama)

    async def search(self, question: str, sha256: str, top_k: int = 4) -> dict:
        return await search_document(self.pool, self.ollama, self.store, question, sha256, top_k)

    async def search_proposal(self, question: str, *, dao_id: str, proposal_id: str,
                              top_k: int = 4, profile_id: str | None = None) -> dict:
        return await search_proposal(self.pool, self.ollama, question, dao_id,
                                     proposal_id, top_k, profile_id)

    async def ask_proposal(self, question: str, *, dao_id: str, proposal_id: str,
                           top_k: int = 4, mode: str = "hybrid",
                           profile_id: str | None = None, tool_calls: int = 0) -> dict:
        return await record_answer(self.recorder, answer_proposal(self.pool, self.ollama,
            question, dao_id, proposal_id, top_k, mode, profile_id, self.search_proposal),
            mode, dao_id, proposal_id, tool_calls)

    async def ask(self, question: str, *, document_sha256: str | None = None,
                  dao_id: str | None = None, proposal_id: str | None = None,
                  top_k: int = 4) -> dict:
        return await record_answer(self.recorder, answer_question(self.pool, self.ollama,
            self.store, question, document_sha256, dao_id, proposal_id, top_k),
            "vector-rag", dao_id, proposal_id)
