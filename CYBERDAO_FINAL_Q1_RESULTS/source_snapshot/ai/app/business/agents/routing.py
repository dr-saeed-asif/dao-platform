"""Validate a semantic (LLM) plan's specialist assignment. Standard library only.

The LLM proposes intent, specialists and dependencies; the server only *validates* them:
unknown or disallowed specialists are dropped (and reported), the intent's primary specialist is always
kept first, and no keyword rule rewrites a valid plan. Regex classification remains only for the legacy
path where no plan exists.
"""

from __future__ import annotations

INTENT_PRIMARY = {
    "research": "research", "proposal": "proposal", "proposal_count": "research", "voting": "governance",
    "evidence": "evidence", "blockchain": "blockchain", "analysis": "analysis",
}
ALL_AGENTS = ("proposal", "evidence", "research", "governance", "analysis", "blockchain")
# Supporting specialists a task of a given primary specialist may legitimately need.
ALLOWED_SUPPORT = {
    "research": {"proposal"},
    "proposal": {"evidence"},
    "evidence": {"proposal"},
    "governance": {"blockchain", "proposal"},
    "blockchain": {"governance", "proposal"},
    "analysis": {"proposal", "evidence", "governance", "blockchain", "research"},
}
MAX_WORKERS_PER_TASK = 4

# Evidence each specialist must obtain for a requirement to count as satisfied.
REQUIRED_EVIDENCE = {
    "research": "stored proposal records (public.proposals)",
    "proposal": "selected proposal record and time window",
    "evidence": "verified linked PDF passages",
    "governance": "stored assignments and votes (public.*)",
    "blockchain": "on-chain snapshot compared with database records",
    "analysis": "findings of the supporting specialists",
}


def resolve_agents(intent: str, proposed: list[str] | None) -> tuple[list[str], list[str]]:
    """Return (agents, dropped).

    - Every proposed specialist must be legal for the intent; illegal ones are dropped and reported.
    - For ordinary intents the intent's own specialist always runs first, then valid supporting ones.
    - `analysis` is an integrating intent: a valid explicit list is exactly the set of source specialists
      it needs (the analysis wording is produced by synthesis), so the primary is not forced in.
    - No valid proposal -> just the intent's own specialist.
    """
    primary = INTENT_PRIMARY[intent]
    allowed = ALLOWED_SUPPORT[primary] | {primary}
    valid, dropped = [], []
    for agent in proposed or []:
        if agent in valid:
            continue
        if agent in allowed and len(valid) < MAX_WORKERS_PER_TASK:
            valid.append(agent)
        else:
            dropped.append(agent)
    if primary == "analysis":
        return (valid or [primary]), dropped
    agents = [primary] + [a for a in valid if a != primary]
    return agents[:MAX_WORKERS_PER_TASK], dropped
