"""Create stable profiles for the configured PDF chunking and Ollama model."""

from hashlib import sha256
from importlib.metadata import version
import json

from app.model.config.settings import settings
from app.model.entities.profiles import EmbeddingProfile
from .pdf_policy import CHUNKING_VERSION, OVERLAP_CHARS, PREPROCESS_VERSION, TARGET_CHARS


async def current_profile(ollama) -> EmbeddingProfile:
    identity = {"provider": "ollama", "model": settings.ollama_embed_model,
        "model_digest": await ollama.digest(), "dimensions": 1024,
        "chunking_version": CHUNKING_VERSION, "target_chars": TARGET_CHARS,
        "overlap_chars": OVERLAP_CHARS,
        "preprocessing_version": PREPROCESS_VERSION,
        "pypdf_version": version("pypdf"), "truncate": False}
    profile_id = "profile-v2-" + sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    return EmbeddingProfile(profile_id, "ollama", settings.ollama_embed_model,
                            identity["model_digest"], 1024, identity)
