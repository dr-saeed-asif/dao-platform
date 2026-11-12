"""Transactional writer for the existing ai document-index tables."""

import json
from app.model.entities.documents import Document
from app.model.entities.profiles import EmbeddingProfile
from .index_chunks import lock_index, mark_ready, replace_chunks, verify_chunks

async def persist_index(pool, document: Document, profile: EmbeddingProfile,
                        vectors: list[list[float]]) -> tuple[int, str]:
    async with pool.connection(timeout=5) as conn:
        async with conn.transaction():
            async with conn.cursor() as cur:
                document_id = await _document_id(cur, document)
                await _ensure_profile(cur, profile)
                index_id, status = await lock_index(cur, document_id, profile.id)
                if status == "READY":
                    await verify_chunks(cur, index_id, document.chunks)
                    return index_id, status
                await replace_chunks(cur, index_id, document.chunks, vectors)
                await mark_ready(cur, index_id)
                return index_id, "INDEXED"
async def _document_id(cur, doc: Document) -> int:
    await cur.execute("""INSERT INTO ai.documents (sha256, filename, byte_size)
        VALUES (%s, %s, %s) ON CONFLICT (sha256) DO NOTHING""",
        (doc.sha256, doc.filename, doc.byte_size))
    await cur.execute("SELECT id FROM ai.documents WHERE sha256 = %s", (doc.sha256,))
    return (await cur.fetchone())[0]
async def _ensure_profile(cur, profile: EmbeddingProfile) -> None:
    identity = profile.settings
    await cur.execute("""INSERT INTO ai.embedding_profiles
        (id, provider, model, model_identity, dimensions, chunking_version,
        target_tokens, overlap_ratio, preprocessing_version, settings)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
        ON CONFLICT (id) DO NOTHING""", profile_values(profile))
    await cur.execute("""SELECT model, model_identity, dimensions, settings
        FROM ai.embedding_profiles WHERE id = %s""", (profile.id,))
    if await cur.fetchone() != (profile.model, profile.model_identity, profile.dimensions, identity):
        raise ValueError("Stored profile does not match settings.")

def profile_values(profile: EmbeddingProfile) -> tuple:
    value = profile.settings
    return (profile.id, profile.provider, profile.model, profile.model_identity,
            profile.dimensions, value["chunking_version"], value["target_chars"] // 4,
            value["overlap_chars"] / value["target_chars"],
            value["preprocessing_version"], json.dumps(value, sort_keys=True))
