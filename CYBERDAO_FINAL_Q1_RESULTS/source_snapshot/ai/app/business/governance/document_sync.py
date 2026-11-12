"""Synchronize only DAO-linked, hash-verified PDFs from trusted local storage."""
from pathlib import Path
from .evidence import verified_pdf_record
from app.business.rag.evidence_files import safe_storage_path, verified_file

async def sync_record(indexer, root: Path, record: dict) -> dict:
    valid, reason = verified_pdf_record(record)
    if not valid:
        raise ValueError(reason)
    path = safe_storage_path(root, record["storage_key"])
    verified_file(path, record)
    return {"evidence_id": record["evidence_id"], **await indexer(path)}
