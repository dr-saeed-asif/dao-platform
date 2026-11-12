"""Build the historical page-v1 embedding profile used by index_pdf.py."""

from hashlib import sha256
from importlib.metadata import version
import json

from app.model.config.settings import settings
from app.business.rag.legacy_pdf_policy import (
    CHUNKING_VERSION, MIN_TEXT_CHARS, OVERLAP_RATIO, TARGET_TOKENS,
)

MODEL = "qwen3-embedding:0.6b"
DIMENSIONS = 1024


async def installed_model_digest() -> str:
    from app.business.rag.ollama_client import Ollama
    return await Ollama().digest()


async def profile_identity() -> tuple[dict, str]:
    if settings.ollama_embed_model != MODEL:
        raise ValueError(f"This initial test supports only {MODEL}.")
    identity = {"provider": "ollama", "model": MODEL,
        "model_digest": await installed_model_digest(),
        "dimensions": DIMENSIONS, "chunking_version": CHUNKING_VERSION,
        "target_tokens": TARGET_TOKENS, "overlap_ratio": OVERLAP_RATIO,
        "preprocessing_version": "pypdf-page-v1", "pypdf_version": version("pypdf"),
        "minimum_page_text_chars": MIN_TEXT_CHARS, "truncate": False}
    profile_id = "profile-v1-" + sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    return identity, profile_id
