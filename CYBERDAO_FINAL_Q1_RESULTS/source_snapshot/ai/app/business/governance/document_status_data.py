"""Build path-free document index metadata for governance status responses."""


def document_status_row(dao_id: str, proposal_id: str, artifact: dict,
                        indexes: list[dict]) -> dict:
    return {"dao_id": dao_id, "proposal_id": proposal_id,
        "evidence_id": artifact["evidence_id"], "filename": safe_filename(artifact["filename"]),
        "evidence_status": "verified", "index_status": index_state(indexes),
        "indexes": indexes}


def excluded_document(dao_id: str, proposal_id: str, artifact: dict,
                      reason: str) -> dict:
    return {"dao_id": dao_id, "proposal_id": proposal_id,
        "evidence_id": artifact["evidence_id"], "filename": safe_filename(artifact["filename"]),
        "evidence_status": reason, "index_status": "not_checked", "indexes": []}


def index_state(indexes: list[dict]) -> str:
    states = {row["status"].lower() for row in indexes}
    if "ready" in states:
        return "ready"
    return next((state for state in ("indexing", "pending", "failed", "ocr_required",
                                     "partial_text") if state in states), "not_indexed")


def safe_filename(value: str) -> str:
    return value.replace("\\", "/").rsplit("/", 1)[-1]
