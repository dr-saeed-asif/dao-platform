"""Frontend-shaped operator compatibility route."""

from fastapi import APIRouter, Depends

from app.business.rag.compatibility import run_legacy_query
from app.presentation.dependencies.services import get_database_pool, get_rag_service
from app.presentation.schemas.compatibility import LegacyQuery
from .metrics import record_operation

router = APIRouter()


@router.post("/query")
async def legacy_query(body: LegacyQuery, pool=Depends(get_database_pool),
                       service=Depends(get_rag_service)):
    output = await run_legacy_query(pool, service, question=body.question,
        proposal_id=body.proposalId, dao_id=body.daoId, system=body.system,
        top_k=body.topK, dataset_version=body.datasetVersion,
        policy_version=body.policyVersion)
    record_operation("legacy-query", output["latencyMs"])
    return output
