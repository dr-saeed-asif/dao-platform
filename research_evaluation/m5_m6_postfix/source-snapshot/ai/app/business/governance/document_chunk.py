"""Retrieve a chunk only through a verified proposal-to-PDF link."""

from app.model.database.document_chunk import chunk_for_indexes
from .document_status import (DocumentNotIndexed, DocumentNotVerified,
    ProposalChunkNotFound, linked_artifact)
from .evidence import normalized_sha256, verified_pdf_record
from .document_status_data import safe_filename
from .proposal_scope import proposal_scope
from .current_evidence import current_evidence


async def proposal_document_chunk(pool, dao_id: str, proposal_id: str,
                                  evidence_id: str, chunk_key: str) -> dict:
    artifact = await linked_artifact(pool, dao_id, proposal_id, evidence_id)
    valid, reason = await current_evidence(pool, artifact)
    if not valid:
        raise DocumentNotVerified(reason)
    scope = await proposal_scope(pool, dao_id, proposal_id)
    indexes = [item for item in scope["indexes"]
               if item["document_sha256"] == normalized_sha256(artifact["computed_hash"])]
    if not indexes:
        raise DocumentNotIndexed("No compatible READY index exists for this linked PDF.")
    row = await chunk_for_indexes(pool, [item["index_id"] for item in indexes], chunk_key)
    if row is None:
        raise ProposalChunkNotFound("Chunk not found in the linked proposal document.")
    return {"dao_id": dao_id, "proposal_id": proposal_id, "evidence_id": evidence_id,
            "filename": safe_filename(artifact["filename"]), **row}
