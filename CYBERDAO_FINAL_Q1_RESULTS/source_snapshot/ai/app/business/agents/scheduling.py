"""Dependency-aware bounded scheduler (standard library only).

Differences from the former wave loop (`gather` over every ready task):
- no wave barrier: a task starts the moment its dependencies succeed and a slot is free;
- backpressure: coroutines are created lazily, never more than `concurrency` in flight, so 100 tasks
  hold 100 cheap job descriptors, not 100 running coroutines;
- a failed/timed-out/cancelled prerequisite marks dependents `dependency_failed` without running them;
- successful outcomes are kept when others fail; cancel() or a deadline stops the rest and keeps partial results.
"""

from __future__ import annotations

import asyncio
import inspect
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

OK, ERROR, TIMEOUT, CANCELLED, DEADLINE, DEPENDENCY_FAILED = (
    "ok", "error", "timeout", "cancelled", "deadline", "dependency_failed")


@dataclass
class Job:
    id: str
    run: Callable[[], Awaitable[Any]]
    depends_on: tuple[str, ...] = ()


@dataclass
class Outcome:
    status: str
    value: Any = None
    error: str | None = None
    started_ms: float | None = None
    finished_ms: float | None = None

    @property
    def ok(self) -> bool:
        return self.status == OK


def validate_jobs(jobs: list[Job]) -> None:
    ids = [j.id for j in jobs]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate task ids.")
    known = set(ids)
    for j in jobs:
        missing = [d for d in j.depends_on if d not in known]
        if missing or j.id in j.depends_on:
            raise ValueError(f"Task {j.id} has an invalid dependency: {missing or j.id}")
    indegree = {j.id: len(set(j.depends_on)) for j in jobs}
    children: dict[str, list[str]] = {i: [] for i in ids}
    for j in jobs:
        for d in set(j.depends_on):
            children[d].append(j.id)
    queue = [i for i, n in indegree.items() if n == 0]
    seen = 0
    while queue:
        cur = queue.pop()
        seen += 1
        for c in children[cur]:
            indegree[c] -= 1
            if indegree[c] == 0:
                queue.append(c)
    if seen != len(ids):
        raise ValueError("Task dependencies contain a cycle.")


class BoundedScheduler:
    def __init__(self, jobs: list[Job], *, concurrency: int, deadline_s: float | None = None,
                 job_timeout_s: float | None = None, on_start: Callable[[str], Any] | None = None,
                 on_result: Callable[[str, Outcome], Any] | None = None,
                 is_success: Callable[[Any], bool] | None = None,
                 clock: Callable[[], float] = time.monotonic):
        if concurrency < 1:
            raise ValueError("concurrency must be >= 1")
        validate_jobs(jobs)
        self.jobs, self.concurrency = jobs, concurrency
        self.deadline_s, self.job_timeout_s = deadline_s, job_timeout_s
        self.on_start, self.on_result, self.clock = on_start, on_result, clock
        self.is_success = is_success
        self.results: dict[str, Outcome] = {}
        self.max_in_flight = 0
        self._stop = asyncio.Event()
        self._t0 = 0.0

    def cancel(self) -> None:
        self._stop.set()

    def _ms(self) -> float:
        return (self.clock() - self._t0) * 1000

    async def _notify(self, fn, *args):
        if fn:
            out = fn(*args)
            if inspect.isawaitable(out):
                await out

    async def _record(self, job_id: str, outcome: Outcome):
        outcome.finished_ms = self._ms()
        self.results[job_id] = outcome
        await self._notify(self.on_result, job_id, outcome)

    async def _guard(self, job: Job):
        coro = job.run()
        return await (asyncio.wait_for(coro, self.job_timeout_s) if self.job_timeout_s else coro)

    async def run(self) -> dict[str, Outcome]:
        self._t0 = self.clock()
        by_id = {j.id: j for j in self.jobs}
        order = [j.id for j in self.jobs]
        running: dict[asyncio.Future, str] = {}
        started: dict[str, float] = {}
        stop_waiter = asyncio.ensure_future(self._stop.wait())
        idle_passes = 0
        try:
            while len(self.results) < len(order):
                elapsed = self.clock() - self._t0
                expired = self.deadline_s is not None and elapsed >= self.deadline_s
                if self._stop.is_set() or expired:
                    await self._abort(running, started, order, DEADLINE if expired and not self._stop.is_set() else CANCELLED)
                    break
                for jid in order:                                   # failure propagation
                    if jid in self.results or jid in started:
                        continue
                    bad = [d for d in by_id[jid].depends_on if d in self.results and not self.results[d].ok]
                    if bad:
                        await self._record(jid, Outcome(DEPENDENCY_FAILED, error=f"prerequisite {bad[0]} did not complete"))
                for jid in order:                                   # lazy, bounded starts
                    if len(running) >= self.concurrency:
                        break
                    if jid in self.results or jid in started:
                        continue
                    if all(d in self.results and self.results[d].ok for d in by_id[jid].depends_on):
                        started[jid] = self._ms()
                        await self._notify(self.on_start, jid)
                        running[asyncio.ensure_future(self._guard(by_id[jid]))] = jid
                        self.max_in_flight = max(self.max_in_flight, len(running))
                if not running:
                    # Nothing in flight: either propagation resolved more tasks (loop again) or we are stuck.
                    idle_passes += 1
                    if idle_passes > len(order) + 2:
                        break
                    continue
                idle_passes = 0
                remaining = None if self.deadline_s is None else max(0.0, self.deadline_s - (self.clock() - self._t0))
                done, _ = await asyncio.wait({*running, stop_waiter}, timeout=remaining,
                                             return_when=asyncio.FIRST_COMPLETED)
                for fut in done:
                    if fut is stop_waiter:
                        continue
                    jid = running.pop(fut)
                    try:
                        value = fut.result()
                        if self.is_success and not self.is_success(value):   # task returned a failed result
                            out = Outcome(ERROR, value=value, error="task reported failure", started_ms=started[jid])
                        else:
                            out = Outcome(OK, value=value, started_ms=started[jid])
                    except asyncio.TimeoutError:
                        out = Outcome(TIMEOUT, error="task timed out", started_ms=started[jid])
                    except asyncio.CancelledError:
                        out = Outcome(CANCELLED, error="task cancelled", started_ms=started[jid])
                    except Exception as exc:          # one task's failure never destroys the others
                        out = Outcome(ERROR, error=f"{type(exc).__name__}: {exc}", started_ms=started[jid])
                    await self._record(jid, out)
        finally:
            stop_waiter.cancel()
            for fut in running:
                fut.cancel()
            if running:
                await asyncio.gather(*running, return_exceptions=True)
        for jid in order:                                           # anything still unresolved
            if jid not in self.results:
                await self._record(jid, Outcome(CANCELLED, error="not started"))
        return self.results

    async def _abort(self, running, started, order, status):
        for fut in running:
            fut.cancel()
        if running:
            await asyncio.gather(*running, return_exceptions=True)
        for fut, jid in list(running.items()):
            await self._record(jid, Outcome(status, error="stopped before completion", started_ms=started.get(jid)))
        running.clear()
        for jid in order:
            if jid not in self.results:
                await self._record(jid, Outcome(status, error="not started"))
