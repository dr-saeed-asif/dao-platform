"""Best-effort writer reusable by RAG, MCP, and agent workflows."""

import logging

from app.model.database.evaluations import insert_run
from app.model.entities.evaluation import RunMetrics

logger = logging.getLogger(__name__)


class RunRecorder:
    def __init__(self, pool):
        self.pool = pool

    async def record(self, metrics: RunMetrics) -> None:
        try:
            await insert_run(self.pool, metrics)
        except Exception as exc:
            # Instrumentation must not change the workflow's result.
            logger.warning("evaluation persistence unavailable (%s)", type(exc).__name__)
