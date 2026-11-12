"""Trusted path and byte checks for linked PDF evidence."""

from hashlib import sha256
from pathlib import Path

from app.business.governance.evidence import normalized_sha256, verified_pdf_record
from .pdf_policy import MAX_BYTES


def safe_storage_path(storage_root: Path, storage_key: str | None) -> Path:
    if not storage_key or not storage_key.strip():
        raise ValueError("Missing artefact storage_key.")
    root = storage_root.resolve(strict=True)
    candidate = (root / storage_key).resolve(strict=True)
    if not candidate.is_relative_to(root) or candidate == root:
        raise ValueError("Artefact storage_key resolves outside trusted root.")
    if not candidate.is_file() or candidate.is_symlink():
        raise ValueError("Artefact storage_key is not a regular file.")
    return candidate


def verified_file(path: Path, record: dict) -> str:
    valid, reason = verified_pdf_record(record)
    if not valid:
        raise ValueError(reason)
    size = path.stat().st_size
    if not 0 < size <= MAX_BYTES:
        raise ValueError("PDF exceeds size limit.")
    if record.get("byte_size") is not None and int(record["byte_size"]) != size:
        raise ValueError("Source artefact byte_size mismatch.")
    digest = sha256(path.read_bytes()).hexdigest()
    if digest != normalized_sha256(record["computed_hash"]):
        raise ValueError("PDF bytes do not match the verified artefact hash.")
    return digest
