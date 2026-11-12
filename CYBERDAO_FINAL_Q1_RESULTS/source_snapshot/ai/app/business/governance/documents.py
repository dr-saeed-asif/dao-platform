"""List proposal artefacts and compatible indexed documents."""

from .evidence import verified_pdf_record
from .proposal_scope import proposal_scope
from app.model.database.proposal_artefacts import linked_artefacts


async def proposal_documents(pool, proposal_id: str, dao_id: str) -> dict:
    artefacts = await linked_artefacts(pool, dao_id, proposal_id)
    scope = await proposal_scope(pool, dao_id, proposal_id)
    rows = [{"evidence_id": item["evidence_id"], "filename": item["filename"],
        "verification_status": item["verification_status"],
        "lifecycle_state": item["lifecycle_state"],
        "status": verified_pdf_record(item)[1]} for item in artefacts]
    return {"dao_id": dao_id, "proposal_id": proposal_id, "linked_artefacts": rows,
        "indexed_documents": scope["documents"], "profile_id": scope["profile_id"]}


async def verified_proposal_documents(pool, proposal_id: str, dao_id: str) -> dict:
    result = await proposal_documents(pool, proposal_id, dao_id)
    result["linked_artefacts"] = [item for item in result["linked_artefacts"]
                                  if item["status"] == "verified"]
    return result
