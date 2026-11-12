"""Requirement ledger: every distinct requested requirement is tracked from plan to completion.

Standard library only. Failure kinds are kept distinct so that missing evidence, execution errors,
timeouts, skipped dependents and cancellation are never conflated.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict

from .routing import REQUIRED_EVIDENCE

PENDING, RUNNING, COMPLETED, FAILED, SKIPPED, CANCELLED = (
    "pending", "running", "completed", "failed", "skipped", "cancelled")
# failure kinds
MISSING_EVIDENCE, EXECUTION_ERROR, TIMEOUT, DEPENDENCY_FAILED, CANCELLED_KIND, DEADLINE = (
    "missing_evidence", "execution_error", "timeout", "dependency_failed", "cancelled", "deadline")


@dataclass
class Requirement:
    id: str
    text: str
    agents: list[str]
    depends_on: list[str] = field(default_factory=list)
    required_evidence: list[str] = field(default_factory=list)
    status: str = PENDING
    failure_kind: str | None = None
    detail: str | None = None
    started_ms: float | None = None
    finished_ms: float | None = None
    answered: bool = False          # completed AND produced a supported finding (not an abstention)


class RequirementLedger:
    def __init__(self, items: list[Requirement]):
        self.items = {r.id: r for r in items}
        self.order = [r.id for r in items]

    @classmethod
    def from_plans(cls, plans) -> "RequirementLedger":
        """`plans` = objects/dicts with question_id, question, agent, agents, depends_on."""
        get = lambda p, k, d=None: p.get(k, d) if isinstance(p, dict) else getattr(p, k, d)
        items = []
        for p in plans:
            agents = list(get(p, "agents") or [get(p, "agent")])
            items.append(Requirement(
                id=get(p, "question_id"), text=get(p, "question"), agents=agents,
                depends_on=list(get(p, "depends_on") or []),
                required_evidence=[REQUIRED_EVIDENCE[a] for a in agents if a in REQUIRED_EVIDENCE]))
        return cls(items)

    def mark(self, rid: str, status: str, *, kind: str | None = None, detail: str | None = None,
             answered: bool | None = None, ms: float | None = None) -> None:
        r = self.items[rid]
        r.status = status
        if status == RUNNING and ms is not None:
            r.started_ms = ms
        if status in (COMPLETED, FAILED, SKIPPED, CANCELLED):
            r.finished_ms = ms
        r.failure_kind, r.detail = kind, detail
        if answered is not None:
            r.answered = answered

    def summary(self) -> dict:
        total = len(self.items)
        by_status: dict[str, int] = {}
        by_kind: dict[str, int] = {}
        for r in self.items.values():
            by_status[r.status] = by_status.get(r.status, 0) + 1
            if r.failure_kind:
                by_kind[r.failure_kind] = by_kind.get(r.failure_kind, 0) + 1
        done = by_status.get(COMPLETED, 0)
        answered = sum(1 for r in self.items.values() if r.answered)
        return {"total": total, "completed": done, "answered": answered,
                "coverage_completed": (done / total) if total else None,
                "coverage_answered": (answered / total) if total else None,
                "by_status": by_status, "by_failure_kind": by_kind,
                "missing_evidence": by_kind.get(MISSING_EVIDENCE, 0),
                "execution_errors": by_kind.get(EXECUTION_ERROR, 0)}

    def to_list(self) -> list[dict]:
        return [asdict(self.items[i]) for i in self.order]
