"""Flat, validated arguments exposed by MCP tools."""

from typing import Annotated

from pydantic import StringConstraints

Identifier = Annotated[str, StringConstraints(strip_whitespace=True,
    min_length=1, max_length=256)]
Question = Annotated[str, StringConstraints(strip_whitespace=True,
    min_length=3, max_length=4000)]
WalletAddress = Annotated[str, StringConstraints(pattern=r"^0x[0-9a-fA-F]{40}$")]
