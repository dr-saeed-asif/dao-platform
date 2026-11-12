"""PDF upload preparation before indexing."""

from hashlib import sha256
from pathlib import Path

from .pdf_policy import MAX_BYTES


async def index_upload(raw: bytes, store) -> dict:
    if not 0 < len(raw) <= MAX_BYTES:
        raise ValueError("PDF must be 1–10 MB.")
    if b"%PDF-" not in raw[:1024]:
        raise ValueError("Invalid PDF header.")
    path = Path("data/rag_uploads") / f"{sha256(raw).hexdigest()}.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(raw)
    return await store.index(path)
