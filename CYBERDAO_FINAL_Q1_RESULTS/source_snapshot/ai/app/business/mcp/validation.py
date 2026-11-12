"""Local MCP operator token validation."""

import secrets


def require_operator_token(provided: str | None, expected: str) -> None:
    if not provided or not secrets.compare_digest(provided, expected):
        raise PermissionError("Valid local operator token required.")
