"""Proposal-scoped pgvector retrieval and evidence formatting."""

from app.model.database.proposal_chunks import search_proposal_chunks
from app.model.entities.evidence import Evidence


async def search_proposal_indexes(pool, indexes: list[dict],
                                  vector: list[float], top_k: int,
                                  cover_each_index: bool = False) -> list[dict]:
    if not indexes:
        return []
    if len(vector) != 1024 or not 1 <= top_k <= 8:
        raise ValueError("Invalid embedding dimensions or top_k.")
    rows = await search_proposal_chunks(pool,
        [item["index_id"] for item in indexes], vector, top_k, cover_each_index)
    by_index = {item["index_id"]: item for item in indexes}
    return [_evidence(row, by_index, number) for number, row in enumerate(rows, 1)]


def _evidence(row: tuple, by_index: dict, number: int) -> dict:
    index = by_index[row[0]]
    return Evidence(f"D{number}", row[4], score=round(float(row[5]), 4),
        metadata={"document_sha256": index["document_sha256"],
        "filename": index["filename"], "artefact_evidence_id": index["artefact_evidence_id"],
        "chunk_key": row[1], "page_number": row[2], "chunk_index": row[3]}).as_dict()
