"""Proposal-scoped search and answer routes."""

from fastapi import APIRouter, Depends

from app.business.rag.compatibility import answer_proposal
from app.presentation.dependencies.services import get_rag_service
from app.presentation.schemas.rag import ProposalAskRequest, ProposalRequest
from .metrics import record_operation

router = APIRouter()


@router.post("/proposals/search")
async def search_proposal(body: ProposalRequest, service=Depends(get_rag_service)):
    output = await service.search_proposal(body.question, dao_id=body.dao_id,
        proposal_id=body.proposal_id, top_k=body.top_k, profile_id=body.profile_id)
    record_operation("proposal-search", output["retrieval_ms"])
    return output


@router.post("/proposals/ask")
async def ask_proposal(body: ProposalAskRequest, service=Depends(get_rag_service)):
    output = await answer_proposal(service, body.question, body.dao_id,
        body.proposal_id, body.top_k, body.system, body.profile_id)
    record_operation("proposal-ask", output["latencyMs"])
    return output
