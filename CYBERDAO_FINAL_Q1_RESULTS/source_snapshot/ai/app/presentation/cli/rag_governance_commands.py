"""Read-only proposal inspection and verified PDF synchronization commands."""

from pathlib import Path

from app.business.governance.evidence import verified_pdf_record
from app.business.governance.proposal_scope import proposal_scope
from app.business.governance.document_sync import sync_record
from app.model.database.proposal_artefacts import linked_artefacts
from .rag_output import dump

async def proposal_documents(pool, dao_id: str, proposal_id: str) -> None:
    artefacts = await linked_artefacts(pool, dao_id, proposal_id)
    scope = await proposal_scope(pool, dao_id, proposal_id)
    dump({"artefacts": [_artifact_view(item) for item in artefacts],
          "ready_documents": scope["documents"], "excluded": scope["excluded"]})


async def sync_proposal(rag, pool, dao_id: str, proposal_id: str, storage_root: str) -> None:
    root = Path(storage_root)
    if not root.is_dir(): raise ValueError("Trusted storage root does not exist.")
    records = await linked_artefacts(pool, dao_id, proposal_id)
    output = await _sync_records(rag, root, records)
    dump(output)
    if not any(item.get("status") in ("INDEXED", "ALREADY_INDEXED") for item in output):
        raise ValueError("No verified linked PDF was indexed. Check artefact metadata.")


def _artifact_view(item: dict) -> dict:
    return {"evidence_id": item["evidence_id"], "filename": item["filename"],
        "storage_key": item["storage_key"], "verification_status": item["verification_status"],
        "lifecycle_state": item["lifecycle_state"], "verification": verified_pdf_record(item)[1]}


async def _sync_records(rag, root: Path, records: list[dict]) -> list[dict]:
    output = []
    for record in records:
        okay, reason = verified_pdf_record(record)
        if not okay:
            output.append({"evidence_id": record["evidence_id"], "skipped": reason})
            continue
        output.append(await _sync_record(rag, root, record))
    return output

async def _sync_record(rag, root: Path, record: dict) -> dict:
    try:
        return await sync_record(rag.store.index, root, record)
    except Exception as exc:
        return {"evidence_id": record["evidence_id"], "error": f"{type(exc).__name__}: {exc}"}
