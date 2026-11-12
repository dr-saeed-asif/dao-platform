"""Authenticated RAG router composition."""

from fastapi import APIRouter, Depends

from app.presentation.dependencies.auth import require_local_token
from . import agents, documents, proposal_rag, search

router = APIRouter(prefix="/rag", tags=["Local RAG"],
                   dependencies=[Depends(require_local_token)])
router.include_router(documents.router)
router.include_router(search.router)
router.include_router(proposal_rag.router)
router.include_router(agents.router)
