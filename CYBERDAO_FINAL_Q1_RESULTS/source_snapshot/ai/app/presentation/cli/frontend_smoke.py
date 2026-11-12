"""Live loopback smoke checks for the integrated Next.js AI contract."""

import httpx
from app.model.config.settings import settings


async def smoke(dao_id: str, proposal_id: str) -> None:
    url = f"http://127.0.0.1:{settings.rag_port}/v1/ai/query"
    payload = {"daoId": dao_id, "proposalId": proposal_id, "system": "hybrid", "topK": 4,
        "question": "What does this proposal request and what does its PDF establish?"}
    timeout = httpx.Timeout(connect=5, read=180, write=10, pool=5)
    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        await _check_auth(client, url, payload)
        result = await client.post(url, json=payload, headers=_headers())
    body = _check_success(result, dao_id, proposal_id)
    print("PASS: Correct DAO and proposal returned HTTP 200.")
    print("PASS: Governance [G1] and linked PDF [D1] evidence returned.")
    print("Run ID:", body.get("runId"), "\nLatency (ms):", body.get("latencyMs"))
    print("Answer:\n", body["answer"], "\n=== PHASE C HTTP SMOKE TEST PASSED ===")


async def _check_auth(client, url: str, payload: dict) -> None:
    missing = await client.post(url, json=payload)
    if missing.status_code != 401:
        raise RuntimeError(f"Expected 401 for missing token; received {missing.status_code}.")
    wrong = await client.post(url, json={**payload, "daoId": "nonexistent-test-dao"},
                              headers=_headers())
    if wrong.status_code != 422:
        raise RuntimeError(f"Expected HTTP 422 for wrong DAO; received {wrong.status_code}. "
                           f"Details: {wrong.text[:500]}")
    print("PASS: Request without operator token returned HTTP 401.")
    print("PASS: Wrong DAO was rejected (HTTP 422).")


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.rag_dev_token.get_secret_value()}"}


def _check_success(result, dao_id: str, proposal_id: str) -> dict:
    if result.status_code != 200:
        raise RuntimeError(f"Expected HTTP 200; received {result.status_code}: {result.text[:600]}")
    body = result.json()
    if body.get("system") != "hybrid" or body.get("scope", {}).get("dao_id") != dao_id:
        raise RuntimeError("Response system or DAO scope is incorrect.")
    if body.get("scope", {}).get("proposal_id") != proposal_id:
        raise RuntimeError("Response proposal scope is incorrect.")
    sources = {item.get("source_id") for item in body.get("evidence") or []}
    if not {"G1", "D1"} <= sources or not str(body.get("answer", "")).strip():
        raise RuntimeError(f"Expected answer with G1 and D1 evidence; received {sorted(sources)}.")
    return body
