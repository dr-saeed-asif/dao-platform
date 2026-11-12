"""PDF upload and indexed-document routes."""

from time import perf_counter

from fastapi import APIRouter, Depends, File, UploadFile

from app.business.governance.documents import proposal_documents
from app.business.rag.uploads import index_upload
from app.presentation.dependencies.services import get_database_pool, get_rag_service
from .metrics import metrics_snapshot, record_operation

router = APIRouter()


@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...), service=Depends(get_rag_service)):
    started = perf_counter()
    raw = await file.read(10 * 1024 * 1024 + 1)
    await file.close()
    result = await index_upload(raw, service.store)
    record_operation("upload-pdf", round((perf_counter() - started) * 1000, 1))
    return result


@router.get("/documents")
async def documents(service=Depends(get_rag_service)):
    return {"documents": await service.store.documents()}


@router.get("/metrics")
async def metrics():
    return metrics_snapshot()


@router.get("/proposals/{proposal_id}/documents")
async def proposal_documents_route(proposal_id: str, dao_id: str,
        pool=Depends(get_database_pool)):
    return await proposal_documents(pool, proposal_id, dao_id)
