"""Scoped index status and chunk reads for authoritative proposal documents."""

from app.model.database.document_index_status import indexes_for_hash
from app.model.database.proposal_artefacts import linked_artefacts
from .evidence import normalized_sha256, verified_pdf_record
from .proposals import get_proposal
from .current_evidence import current_evidence
from .document_status_data import document_status_row, excluded_document


class DocumentScopeError(ValueError):
    code = "document_not_linked"


class DocumentNotVerified(ValueError):
    code = "evidence_not_verified"


class DocumentNotIndexed(ValueError):
    code = "document_not_indexed"


class ProposalChunkNotFound(ValueError):
    code = "chunk_not_found"


async def document_index_status(pool, dao_id: str, proposal_id: str,
                                evidence_id: str) -> dict:
    artifact = await linked_artifact(pool, dao_id, proposal_id, evidence_id)
    valid, reason = await current_evidence(pool, artifact)
    if not valid:
        return excluded_document(dao_id, proposal_id, artifact, reason)
    indexes = await indexes_for_hash(pool, normalized_sha256(artifact["computed_hash"]))
    return document_status_row(dao_id, proposal_id, artifact, indexes)


async def proposal_evidence_status(pool, dao_id: str, proposal_id: str) -> dict:
    await get_proposal(pool, dao_id, proposal_id)
    artifacts = await linked_artefacts(pool, dao_id, proposal_id)
    documents = [await _status_for_artifact(pool, dao_id, proposal_id, item)
                 for item in artifacts]
    verified = sum(item["evidence_status"] == "verified" for item in documents)
    indexed = sum(index["status"] == "READY" for item in documents
                  for index in item["indexes"])
    return {"dao_id": dao_id, "proposal_id": proposal_id,
            "verified_linked_count": verified, "ready_index_count": indexed,
            "documents": documents}


async def _status_for_artifact(pool, dao_id: str, proposal_id: str, artifact: dict) -> dict:
    valid, reason = await current_evidence(pool, artifact)
    if not valid:
        return excluded_document(dao_id, proposal_id, artifact, reason)
    rows = await indexes_for_hash(pool, normalized_sha256(artifact["computed_hash"]))
    return document_status_row(dao_id, proposal_id, artifact, rows)


async def linked_artifact(pool, dao_id: str, proposal_id: str, evidence_id: str) -> dict:
    await get_proposal(pool, dao_id, proposal_id)
    rows = await linked_artefacts(pool, dao_id, proposal_id)
    for item in rows:
        if item["evidence_id"] == evidence_id:
            return item
    raise DocumentScopeError("Evidence is not linked to this DAO proposal.")
