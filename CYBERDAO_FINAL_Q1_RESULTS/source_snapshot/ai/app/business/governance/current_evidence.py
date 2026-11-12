"""Validate current linked bytes before exposing derived document evidence."""
from pathlib import Path

from app.model.config.settings import settings
from app.model.database.index_invalidation import invalidate_document_indexes
from app.business.rag.evidence_files import safe_storage_path, verified_file
from .evidence import verified_pdf_record, normalized_sha256


async def current_evidence(pool, record: dict) -> tuple[bool, str]:
    valid, reason = verified_pdf_record(record)
    digest = normalized_sha256(record.get("computed_hash"))
    if not valid:
        if digest and (str(record.get("verification_status", "")).upper() == "FAILED"
                       or record.get("lifecycle_state") in {"FAILED", "ORPHANED"}):
            await invalidate_document_indexes(pool, digest, reason)
        return False, reason
    if not settings.dao_artefact_storage_dir:
        return False, "Current document bytes are unavailable: trusted storage is not configured"
    try:
        path = safe_storage_path(Path(settings.dao_artefact_storage_dir), record.get("storage_key"))
        verified_file(path, record)
    except (OSError, ValueError) as exc:
        reason = f"Current document integrity check failed ({type(exc).__name__})"
        if digest:
            await invalidate_document_indexes(pool, digest, reason)
        return False, reason
    return True, "Current document bytes match verified metadata"
