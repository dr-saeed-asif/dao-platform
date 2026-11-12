"""Legacy AI query orchestration."""

from app.model.database.proposals import resolve_dao_id


class UnsupportedAiRequest(Exception):
    """A legacy query option is not implemented by this server."""


async def answer_proposal(service, question: str, dao_id: str, proposal_id: str,
                          top_k: int, mode: str, profile_id: str | None) -> dict:
    if mode not in ("hybrid", "vector-rag"):
        raise UnsupportedAiRequest("Only hybrid and vector-rag are implemented.")
    return await service.ask_proposal(
        question, dao_id=dao_id, proposal_id=proposal_id, top_k=top_k,
        mode=mode, profile_id=profile_id,
    )


async def run_legacy_query(pool, service, *, question: str, proposal_id: str,
                           dao_id: str | None, system: str, top_k: int,
                           dataset_version: str | None, policy_version: str | None) -> dict:
    if system not in ("hybrid", "vector-rag"):
        raise UnsupportedAiRequest(f"AI system '{system}' not migrated.")
    if dataset_version or policy_version:
        raise UnsupportedAiRequest("Dataset/policy versioning not migrated.")
    resolved = await resolve_dao_id(pool, proposal_id, dao_id)
    return await service.ask_proposal(question, dao_id=resolved,
                                      proposal_id=proposal_id, top_k=top_k, mode=system)
