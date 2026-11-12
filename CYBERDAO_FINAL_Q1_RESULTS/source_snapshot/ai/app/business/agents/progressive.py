"""Progressive answer assembly (standard library only).

Sections are keyed by task id and rendered in plan order. A section is emitted the moment its task has a
verified finding: directly when the specialist already produced final text, otherwise after a bounded group
write by the synthesis writer, which runs while other specialists are still executing. A failed or
rejected write falls back to the specialist's own verbatim finding. Failed tasks yield an explicit
"unavailable" section whose wording depends on the failure kind (missing evidence is not an error).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable

UNAVAILABLE = {
    "missing_evidence": "The available evidence does not establish this part. No supporting records were found; this is not an execution failure.",
    "execution_error": "This check could not run because of an execution error. It is unavailable; retry this check.",
    "verification_failed": "The answer for this part could not be verified against its sources, so it is withheld.",
    "timeout": "This check timed out. This part is unavailable; retry this check.",
    "dependency_failed": "This part was skipped because a prerequisite check did not complete.",
    "cancelled": "This check was cancelled before it completed.",
    "deadline": "The time budget ran out before this check completed. This part is unavailable.",
}


def unavailable_text(kind: str | None) -> str:
    return UNAVAILABLE.get(kind or "execution_error", UNAVAILABLE["execution_error"])


@dataclass
class Section:
    task_id: str
    order: int
    title: str
    text: str = ""
    status: str = "pending"        # pending | queued | writing | done | unavailable
    source: str | None = None      # direct | composed | fallback | unavailable
    failure_kind: str | None = None
    revision: int = 0
    fallback: str = ""
    suffix: str = ""               # unavailable notes for failed sibling workers of the same task
    emitted_ms: float | None = None


WriteGroup = Callable[[list[str]], Awaitable[dict[str, str]]]


class ProgressiveAssembler:
    def __init__(self, task_ids: list[str], titles: dict[str, str], emit: Callable[[str, dict], None],
                 write_group: WriteGroup | None = None, *, group_size: int = 4,
                 clock: Callable[[], float] = time.monotonic):
        self.sections = {t: Section(t, i, titles.get(t, t)) for i, t in enumerate(task_ids)}
        self.emit, self.write_group, self.group_size, self.clock = emit, write_group, max(1, group_size), clock
        self._q: asyncio.Queue = asyncio.Queue()
        self._writer: asyncio.Task | None = None
        self._t0 = clock()
        self.marks: dict[str, float] = {}
        self.write_batches: list[int] = []

    def _ms(self) -> float:
        return (self.clock() - self._t0) * 1000

    def start(self) -> None:
        if self._writer is None:
            self._writer = asyncio.ensure_future(self._run_writer())

    def _publish(self, s: Section) -> None:
        s.revision += 1
        s.emitted_ms = self._ms()
        self.marks.setdefault("first_section_ms", s.emitted_ms)
        if s.source in ("direct", "composed", "fallback"):      # a failure notice is not a meaningful answer
            self.marks.setdefault("first_meaningful_section_ms", s.emitted_ms)
        self.emit("answer_section", {"task_id": s.task_id, "order": s.order, "title": s.title, "text": s.text,
                                     "status": s.status, "source": s.source, "failure_kind": s.failure_kind,
                                     "revision": s.revision, "elapsed_ms": s.emitted_ms})

    def finding(self, task_id: str, *, ok: bool, text: str | None = None, needs_write: bool = False,
                failure_kind: str | None = None, suffix: str = "") -> None:
        """Register a task outcome. Called as each specialist finishes (completion order)."""
        s = self.sections[task_id]
        self.marks.setdefault("first_finding_ms", self._ms())
        if not ok:
            s.status, s.source, s.failure_kind = "unavailable", "unavailable", failure_kind or "execution_error"
            s.text = unavailable_text(s.failure_kind)
            self._publish(s)
        elif needs_write and self.write_group is not None:
            s.status, s.fallback, s.suffix = "queued", text or "", suffix
            self._q.put_nowait(task_id)
        else:
            s.status, s.source, s.text = "done", "direct", ((text or "") + (("\n\n" + suffix) if suffix else ""))
            self._publish(s)

    async def _run_writer(self) -> None:
        closing = False
        while not closing:
            first = await self._q.get()
            if first is None:
                break
            batch = [first]
            while len(batch) < self.group_size and not self._q.empty():
                nxt = self._q.get_nowait()
                if nxt is None:
                    closing = True
                    break
                batch.append(nxt)
            await self._write(batch)

    async def _write(self, batch: list[str]) -> None:
        self.write_batches.append(len(batch))
        for t in batch:
            self.sections[t].status = "writing"
        self.emit("answer_progress", {"status": "writing", "task_ids": batch, "elapsed_ms": self._ms()})
        try:
            written = await self.write_group(batch)
        except asyncio.CancelledError:
            raise
        except Exception:
            written = {}
        for t in batch:
            s = self.sections[t]
            text = (written or {}).get(t)
            if text and text.strip():
                s.text, s.source = text.strip(), "composed"
            else:
                s.text, s.source = s.fallback, "fallback"
            if s.suffix:
                s.text = f"{s.text}\n\n{s.suffix}"
            s.status = "done"
            self._publish(s)

    async def close(self) -> None:
        """Drain queued writes, then stop the writer."""
        if self._writer is not None:
            self._q.put_nowait(None)
            await self._writer
            self._writer = None
        self.marks.setdefault("final_ms", self._ms())

    async def abort(self) -> None:
        if self._writer is not None:
            self._writer.cancel()
            await asyncio.gather(self._writer, return_exceptions=True)
            self._writer = None

    def assemble(self) -> str:
        parts = []
        for s in sorted(self.sections.values(), key=lambda x: x.order):
            body = s.text or (unavailable_text("execution_error") if s.status != "done" else "")
            parts.append(f"{s.title}\n{body}")
        return "\n\n".join(parts)

    def stats(self) -> dict:
        secs = list(self.sections.values())
        return {"sections": len(secs), "published": sum(1 for s in secs if s.revision),
                "revisions": sum(max(0, s.revision - 1) for s in secs),
                "composed": sum(1 for s in secs if s.source == "composed"),
                "fallback": sum(1 for s in secs if s.source == "fallback"),
                "direct": sum(1 for s in secs if s.source == "direct"),
                "unavailable": sum(1 for s in secs if s.source == "unavailable"),
                "write_batches": list(self.write_batches), **self.marks}
