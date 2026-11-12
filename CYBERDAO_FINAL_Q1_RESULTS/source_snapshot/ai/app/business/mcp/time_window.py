"""Derive current time-window state without reinterpreting stored proposal status."""

from datetime import datetime, timezone


def proposal_time_window(proposal: dict, now: datetime | None = None) -> dict:
    evaluated = now or datetime.now(timezone.utc)
    starts, ends = _datetime(proposal.get("startsAt")), _datetime(proposal.get("endsAt"))
    if starts and evaluated < starts:
        state = "upcoming"
    elif ends and evaluated > ends:
        state = "ended"
    else:
        state = "active" if starts or ends else "unscheduled"
    return {"stored_status": proposal.get("status"),
        "starts_at": starts, "ends_at": ends, "evaluated_at": evaluated,
        "time_window_state": state}


def _datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
