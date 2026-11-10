"""Read-only comparison of the orphan assignment with legacy SQLite provenance."""
import asyncio
import hashlib
import json
import platform
import sqlite3
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent


async def main():
    history = json.loads((ROOT / "springer_history/assignment_history.json").read_text(encoding="utf8"))
    async with AsyncConnectionPool(settings.postgres_url, kwargs={
        "options": "-c default_transaction_read_only=on", "autocommit": True, "row_factory": dict_row,
    }, open=False) as pool:
        async with pool.connection() as conn:
            result = await conn.execute("""
                SELECT a.member_address, a.transaction_hash, a.effective_from, a.updated_at,
                       a.latest_evidence_id, t.receipt_status, t.operation,
                       t.block_number, t.created_at AS transaction_recorded_at
                FROM public.proposal_assignments a
                JOIN public.proposals p ON p.id=a.proposal_id
                LEFT JOIN public.chain_transactions t
                  ON t.transaction_hash=a.transaction_hash AND t.chain_id=p.chain_id
                WHERE a.proposal_id=%s AND a.assigned IS TRUE
                  AND NOT EXISTS (
                    SELECT 1 FROM public.governance_events e
                    WHERE e.chain_id=p.chain_id AND e.contract_address=p.contract_address
                      AND e.proposal_id=p.on_chain_id AND e.canonical IS TRUE
                      AND lower(e.event_args->>'member')=lower(a.member_address)
                  )
            """, (history["proposal_id"],))
            candidates = await result.fetchall()
    evidence = {"candidate_rows": len(candidates), "database_access": "Read-only PostgreSQL and SQLite", "matches": []}
    legacy_path = REPO / "data/dao.db"
    evidence["legacy_database_available"] = legacy_path.exists()
    if legacy_path.exists():
        legacy = sqlite3.connect(legacy_path.resolve().as_uri() + "?mode=ro", uri=True)
        legacy.row_factory = sqlite3.Row
        try:
            legacy.execute("PRAGMA query_only=ON")
            legacy.execute("BEGIN")
            for row in candidates:
                assignment = legacy.execute("""
                    SELECT assigned_at, transaction_hash FROM proposal_assignments
                    WHERE proposal_id=? AND lower(wallet_address)=lower(?)
                """, (history["proposal_id"], row["member_address"])).fetchone()
                tx = legacy.execute("""
                    SELECT operation, status, block_number, recorded_at FROM chain_transactions
                    WHERE lower(transaction_hash)=lower(?)
                """, (row["transaction_hash"],)).fetchone()
                evidence["matches"].append({
                    "postgres_status": row["receipt_status"], "postgres_operation": row["operation"],
                    "postgres_block_number": str(row["block_number"]),
                    "latest_evidence_missing": row["latest_evidence_id"] is None,
                    "legacy_assignment_found": assignment is not None,
                    "legacy_transaction_reference_matches": bool(assignment and assignment["transaction_hash"].lower() == row["transaction_hash"].lower()),
                    "legacy_assigned_at": assignment["assigned_at"] if assignment else None,
                    "postgres_effective_from": row["effective_from"].isoformat(),
                    "legacy_transaction": dict(tx) if tx else None,
                })
        finally:
            legacy.close()
    evidence["receipt_authority"] = "../springer_history/failed_assignment_receipt.json (canonical status 0x0)"
    evidence["privacy"] = "Member addresses and transaction hashes omitted"
    evidence["historical_attribution_limit"] = "Matching legacy data and compatible write paths do not identify a particular HTTP request or import execution without audit logs."
    with (HERE / "assignment_write_provenance.json").open("x", encoding="utf8") as file:
        json.dump(evidence, file, indent=2, default=str)
    print("Read-only assignment provenance saved; candidate rows", len(candidates))


if __name__ == "__main__":
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop if platform.system() == "Windows" else asyncio.new_event_loop)
