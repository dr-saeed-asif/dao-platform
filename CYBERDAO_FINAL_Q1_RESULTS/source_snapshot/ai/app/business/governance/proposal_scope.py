"""Discover verified, linked PDFs with READY indexes for one DAO proposal."""

from app.model.config.settings import settings
from app.model.database.proposal_artefacts import linked_artefacts
from app.model.database.proposal_indexes import ready_proposal_indexes
from app.business.rag.ollama_client import Ollama
from .current_evidence import current_evidence
from .profiles import candidate_hashes, profiles_by_document, select_profile


async def proposal_scope(pool, dao_id: str, proposal_id: str,
                         profile_id: str | None = None, *, ollama=None) -> dict:
    artefacts = await linked_artefacts(pool, dao_id, proposal_id)
    current, invalid = [], []
    for record in artefacts:
        valid, reason = await current_evidence(pool, record)
        if valid:
            current.append(record)
        else:
            invalid.append({"evidence_id": record["evidence_id"], "reason": reason})
    candidates, excluded = candidate_hashes(current)
    excluded.extend(invalid)
    if not candidates:
        return _empty_scope(profile_id, excluded)
    digest = await (ollama or Ollama()).digest()
    rows = await ready_proposal_indexes(pool, list(candidates),
                                       settings.ollama_embed_model, digest)
    profiles = profiles_by_document(rows)
    profile_id = select_profile(profiles, profile_id)
    indexes = _indexes(profiles.get(profile_id, {}), candidates)
    return {"indexes": indexes, "profile_id": profile_id, "excluded": excluded,
            "linked_pdf_count": len(candidates), "documents": _documents(indexes)}


def _empty_scope(profile_id: str | None, excluded: list[dict]) -> dict:
    return {"indexes": [], "profile_id": profile_id, "excluded": excluded,
            "linked_pdf_count": 0, "documents": []}


def _indexes(chosen: dict[str, tuple], candidates: dict[str, list[dict]]) -> list[dict]:
    return [{"index_id": int(row[0]), "profile_id": row[1], "document_sha256": row[2],
        "filename": candidates[row[2]][0].get("filename") or row[3], "artefact_evidence_id": candidates[row[2]][0]["evidence_id"]}
        for row in chosen.values()]


def _documents(indexes: list[dict]) -> list[dict]:
    return [{"sha256": item["document_sha256"], "filename": item["filename"],
        "artefact_evidence_id": item["artefact_evidence_id"]} for item in indexes]
