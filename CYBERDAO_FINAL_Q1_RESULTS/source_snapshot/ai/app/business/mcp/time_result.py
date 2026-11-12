"""Structured result for the proposal stored status and current time window."""

from datetime import datetime

from pydantic import BaseModel

from .results import ToolErrorDetail


class TimeWindowData(BaseModel):
    dao_id: str
    proposal_id: str
    stored_status: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    evaluated_at: datetime
    time_window_state: str
    status_explanation: str


class TimeWindowResult(BaseModel):
    success: bool
    data: TimeWindowData | None = None
    error: ToolErrorDetail | None = None
