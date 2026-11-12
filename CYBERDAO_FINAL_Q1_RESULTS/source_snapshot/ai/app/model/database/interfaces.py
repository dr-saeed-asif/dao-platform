"""Minimal database capability consumed outside the model layer."""

from typing import Any, Protocol


class DatabasePool(Protocol):
    def connection(self, timeout: float = 5) -> Any: ...
