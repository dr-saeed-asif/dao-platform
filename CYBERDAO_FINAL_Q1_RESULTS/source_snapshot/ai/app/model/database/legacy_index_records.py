"""Persist historical document and embedding-profile records."""

import json
from typing import Any

from app.model.entities.legacy_pdf import PdfResult


async def document_id(cursor: Any, pdf: PdfResult, filename: str, byte_size: int) -> int:
    await cursor.execute("""INSERT INTO ai.documents (sha256,filename,byte_size)
        VALUES (%s,%s,%s) ON CONFLICT (sha256) DO NOTHING""",
        (pdf.sha256, filename, byte_size))
    await cursor.execute("SELECT id FROM ai.documents WHERE sha256=%s", (pdf.sha256,))
    return (await cursor.fetchone())[0]


async def profile(cursor: Any, profile_id: str, identity: dict) -> None:
    encoded = json.dumps(identity, sort_keys=True)
    await cursor.execute("""INSERT INTO ai.embedding_profiles
        (id,provider,model,model_identity,dimensions,chunking_version,target_tokens,
        overlap_ratio,preprocessing_version,settings)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT (id) DO NOTHING""",
        (profile_id, "ollama", identity["model"], identity["model_digest"],
         identity["dimensions"], identity["chunking_version"], identity["target_tokens"],
         identity["overlap_ratio"], identity["preprocessing_version"], encoded))
    await cursor.execute("SELECT model,model_identity,dimensions,settings "
                         "FROM ai.embedding_profiles WHERE id=%s", (profile_id,))
    if await cursor.fetchone() != (identity["model"], identity["model_digest"],
                                   identity["dimensions"], identity):
        raise ValueError("Stored embedding profile does not match.")
