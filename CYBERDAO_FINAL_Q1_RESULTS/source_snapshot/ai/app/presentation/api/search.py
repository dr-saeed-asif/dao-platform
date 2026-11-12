"""Standalone PDF search and ask routes."""

from fastapi import APIRouter, Depends

from app.presentation.dependencies.services import get_rag_service
from app.presentation.schemas.rag import AskRequest, SearchRequest
from .metrics import record_operation

router = APIRouter()


@router.post("/search")
async def search(body: SearchRequest, service=Depends(get_rag_service)):
    output = await service.search(body.question, body.document_sha256, body.top_k)
    record_operation("search", output["retrieval_ms"])
    return output


@router.post("/ask-ai")
async def ask_ai(body: AskRequest, service=Depends(get_rag_service)):
    output = await service.ask(body.question, document_sha256=body.document_sha256,
                               dao_id=body.dao_id, proposal_id=body.proposal_id,
                               top_k=body.top_k)
    record_operation("ask-ai", output["latencyMs"])
    return output
