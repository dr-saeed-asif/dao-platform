"""Fail-closed validation for artefacts linked by the DAO backend."""

from hashlib import sha256
import re

_HASH = re.compile(r"^[a-f0-9]{64}$")


def normalized_sha256(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip().lower().removeprefix("sha256:").removeprefix("0x")
    return text if _HASH.fullmatch(text) else None


def verified_pdf_record(record: dict) -> tuple[bool, str]:
    if record["lifecycle_state"] != "LINKED":
        return False, "artefact is not LINKED"
    if record["verification_status"].upper() != "VERIFIED":
        return False, "artefact verification status is not VERIFIED"
    algorithm = (record.get("hash_algorithm") or "sha256").lower().replace("-", "")
    if algorithm != "sha256":
        return False, "unsupported hash algorithm"
    digest = normalized_sha256(record.get("computed_hash"))
    if digest is None:
        return False, "verified artefact has no valid computed SHA-256"
    expected = record.get("expected_hash")
    if expected is not None and normalized_sha256(expected) != digest:
        return False, "expected/computed hash mismatch"
    media = record.get("media_type")
    if media and media.lower() not in ("application/pdf", "application/x-pdf"):
        return False, "artefact is not a PDF"
    return True, "verified"
