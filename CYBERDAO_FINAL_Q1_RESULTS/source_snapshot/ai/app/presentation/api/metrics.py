"""Process-local RAG request metrics."""

from collections import deque

_recent = deque(maxlen=100)


def record_operation(operation: str, milliseconds: float) -> None:
    _recent.append({"operation": operation, "ms": milliseconds})


def metrics_snapshot() -> dict:
    values = list(_recent)
    mean = round(sum(item["ms"] for item in values) / len(values), 1) if values else None
    return {"scope": "current-server-process-only", "request_count": len(values),
            "mean_ms": mean, "recent": values[-20:]}
