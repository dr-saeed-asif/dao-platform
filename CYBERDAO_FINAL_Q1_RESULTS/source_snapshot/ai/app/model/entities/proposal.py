"""Proposal data returned by the DAO adapter."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class Proposal:
    id: Any
    dao_id: Any
    title: str | None = None
    purpose: str | None = None
    description: str | None = None
    status: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    on_chain_id: Any = None
    chain_id: Any = None
    contract_address: str | None = None
    total_votes: Any = None

    def as_legacy_dict(self) -> dict:
        return {
            "id": self.id, "daoId": self.dao_id,
            "onChainId": _text(self.on_chain_id), "chainId": _text(self.chain_id),
            "contractAddress": self.contract_address, "title": self.title,
            "purpose": self.purpose, "description": self.description,
            "status": self.status, "startsAt": _timestamp(self.starts_at),
            "endsAt": _timestamp(self.ends_at), "totalVotes": _text(self.total_votes),
        }


def _text(value: Any) -> str | None:
    return None if value is None else str(value)


def _timestamp(value: datetime | None) -> str | None:
    return None if value is None else value.isoformat()
