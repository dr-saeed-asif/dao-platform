"""Summarize one M4 run while keeping raw proposal evidence local."""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from statistics import median
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
HISTORICAL = HERE.parent / "springer" / "reconciliation.jsonl"
ROSTER = HERE.parent / "springer" / "reconciliation_config.json"
STATUSES = ("verified", "mismatched", "unverified", "unavailable", "failed", "not_attempted")


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def rows(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]


def field_name(field):
    return field.split(":", 1)[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("--output-dir", type=Path, default=HERE)
    args = parser.parse_args()
    destination = args.output_dir.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    names = ("reconciliation_39_results.csv", "reconciliation_39_summary.json", "reconciliation_39_comparison.md")
    if any((destination / name).exists() for name in names):
        parser.error("Choose an output directory without existing analysis files")
    run = args.run.resolve()
    config = load(run / "configuration.json")
    preflight = load(run / "preflight.json") if (run / "preflight.json").exists() else {}
    old = {r["proposal_id"]: r for r in rows(HISTORICAL)}
    observed = rows(run / "responses.jsonl")
    new = {r["proposal_id"]: r for r in observed}
    roster = load(ROSTER)["cohort_ids"]
    if len(roster) != 39 or len(old) != 39 or len(new) != len(observed) or set(new) - set(roster):
        raise ValueError("Unexpected historical or observed roster")
    sql_path = run / "sql_evidence.local.json"
    evidence = load(sql_path) if sql_path.exists() else {}
    matching_ids = sum(str(p["on_chain_id"]) == str(old[p["id"]]["on_chain_id"])
                       for p in evidence.get("proposals", []))
    counts = dict.fromkeys(STATUSES, 0)
    transitions, checks, causes = Counter(), Counter(), Counter()
    mismatches, status_rechecks = [], []
    table = []
    for proposal_id in roster:
        before = old[proposal_id]
        attempt = new.get(proposal_id, {})
        after = attempt.get("status", "not_attempted")
        report = attempt.get("report", {})
        checkpoint = report.get("indexer_checkpoint", {})
        comparisons = report.get("comparisons", [])
        counts[after] += 1
        transitions[(before["status"], after)] += 1
        checks.update((field_name(c["field"]), c["status"]) for c in comparisons)
        reasons = [{"field": field_name(c["field"]), "status": c["status"], "reason": c.get("reason")}
                   for c in comparisons if c["status"] != "verified"]
        causes.update({(reason["field"], reason["status"], reason["reason"] or "")
                       for reason in reasons})
        mismatched = [c for c in comparisons if c["status"] == "mismatched"]
        mismatched_receipts = sum(t["status"] == "mismatched" for t in report.get("transactions", []))
        if after == "mismatched":
            scalar = [{k: c[k] for k in ("field", "database", "blockchain")}
                      for c in mismatched if c["field"] in {
                          "voting_status", "public.proposal_assignments.count", "public.votes.count",
                          "public.proposals.total_votes", "finalized", "winning_option", "tied", "governance_events.count"
                      }]
            mismatches.append({"proposal_id": proposal_id, "on_chain_id": report.get("on_chain_id"),
                               "fields": dict(Counter(field_name(c["field"]) for c in mismatched)),
                               "scalar": scalar, "mismatched_receipts": mismatched_receipts})
        if any(c["field"] == "voting_status" and c["status"] == "mismatched"
               for c in before.get("scalar_findings", [])):
            state = next((c for c in comparisons if c["field"] == "voting_status"), {})
            status_rechecks.append({"proposal_id": proposal_id, "outcome": after, "state_check": state})
        table.append({
            "proposal_id": proposal_id, "on_chain_id": report.get("on_chain_id", before.get("on_chain_id")),
            "historical_status": before["status"], "outcome": after, "pinned_block": report.get("block_number"),
            "pinned_block_hash": report.get("block_hash"), "checkpoint_status": checkpoint.get("status"),
            "checkpoint_block": checkpoint.get("processed_block_number"), "lag_blocks": checkpoint.get("lag_blocks"),
            "field_counts": json.dumps(Counter(c["status"] for c in comparisons), sort_keys=True),
            "non_verified_comparisons": json.dumps(reasons, ensure_ascii=True),
            "mismatched_receipts": mismatched_receipts, "errors": json.dumps(report.get("errors", [])),
            "execution_error_type": attempt.get("error_type"), "wall_ms": attempt.get("duration_ms"),
        })
    times = [r["duration_ms"] for r in observed if "duration_ms" in r]
    summary = {
        "experiment": "M4 corrected-verifier observational follow-up", "expected": len(roster),
        "attempted": len(new), "outcomes": counts,
        "run_state": "complete" if len(new) == len(roster) and (run / "metrics.json").exists()
                     else "interrupted" if new else "blocked",
        "historical_outcomes": dict(Counter(r["status"] for r in old.values())),
        "outcome_transitions": [{"historical": a, "corrected": b, "count": n}
                                for (a, b), n in sorted(transitions.items())],
        "pin": {"number": config.get("block_number"), "hash": config.get("block_hash")},
        "preflight": preflight,
        "historical_sql_and_chain_id_pairs_matched": matching_ids,
        "frozen_sql_row_counts": {table: len(entries) for table, entries in evidence.items()},
        "service_errors": dict(Counter(e for row in observed for e in row.get("report", {}).get("errors", []))),
        "wall_ms": {"n": len(times), "median": median(times), "min": min(times), "max": max(times)} if times else None,
        "comparison_counts": [{"field": f, "status": s, "n": n} for (f, s), n in sorted(checks.items())],
        "uncertainty_counts_by_proposal": [{"field": f, "status": s, "reason": r, "n": n}
                                           for (f, s, r), n in sorted(causes.items())],
        "mismatched_proposals": mismatches, "historical_status_discrepancies_rechecked": status_rechecks,
    }
    with (destination / "reconciliation_39_results.csv").open("x", encoding="utf-8", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=list(table[0]))
        writer.writeheader()
        writer.writerows(table)
    (destination / "reconciliation_39_summary.json").open("x", encoding="utf-8").write(json.dumps(summary, indent=2) + "\n")
    write_comparison(summary, run, destination)
    print(json.dumps({k: summary[k] for k in ("run_state", "attempted", "outcomes", "wall_ms")}, indent=2))


def write_comparison(summary, run, destination):
    counts = summary["outcomes"]
    old = summary["historical_outcomes"]
    check = summary["preflight"]
    title = [
        "# Experiment 1 reconciliation comparison",
        "",
        f"The corrected C7 run is **{summary['run_state']}** with **{summary['attempted']}/39** original proposals attempted.",
        "",
        "| Outcome | Archived verifier | C7 follow-up |",
        "|---|---:|---:|",
    ]
    title += [f"| {status} | {old.get(status, 0)} | {counts[status]} |" for status in STATUSES]
    title += ["", "| Archived outcome | C7 outcome | Proposals |", "|---|---|---:|"]
    title += [f"| {r['historical']} | {r['corrected']} | {r['count']} |" for r in summary["outcome_transitions"]]
    affected = summary["historical_status_discrepancies_rechecked"]
    verified = sum(r["state_check"].get("status") == "verified" for r in affected)
    finalized = sum(r["state_check"].get("database") == "Closed" and r["state_check"].get("blockchain") == "Closed"
                    and r["state_check"].get("status") == "verified" for r in affected)
    checkpoint_missing = sum(r["n"] for r in summary["uncertainty_counts_by_proposal"]
                             if r["field"] == "indexer_checkpoint" and r["reason"].startswith("No checkpoint"))
    full = next((c for c in check.get("checkpoints", []) if c["indexer_name"] == "governance-full"), None)
    title += [
        "",
        f"The archived status-discrepancy subset contains {len(affected)} proposals. Their voting-status field verified in {verified}/{len(affected)} cases, including {finalized} Closed/Closed comparisons. Overall outcomes also depend on other fields and checkpoint evidence.",
        "",
        f"The verifier reported a missing scoped checkpoint for {checkpoint_missing}/{summary['attempted']} attempts.",
    ]
    if full:
        gap = int(check["block_number"]) - int(full["processed_block_number"])
        title += [
            f"The frozen SQL snapshot contains governance-full version `{full['indexer_version']}` at block {full['processed_block_number']}, {gap:,} blocks below the common pin. The C7 service queries version `1`. This version discrepancy explains missing scoped coverage when reported. The stored height is evidence of the legacy checkpoint's position. The run did not establish compatibility or canonical anchoring for that row.",
        ]
    title += ["", "## Evidence gaps and execution", ""]
    by_field = {c["field"]: c["n"] for c in summary["comparison_counts"] if c["status"] == "unverified"}
    for key in ("winning_option", "tied", "governance_events.historical_coverage"):
        if key in by_field:
            title.append(f"- {key} was unverified in {by_field[key]} field comparisons.")
    title.append(f"- Recorded service errors: {json.dumps(summary['service_errors'], sort_keys=True)}. Unavailable outcomes: {counts['unavailable']}. Thrown execution failures: {counts['failed']}.")
    if summary["wall_ms"]:
        timing = summary["wall_ms"]
        title.append(f"- Wall time median {timing['median'] / 1000:.3f} s, range {timing['min'] / 1000:.3f}–{timing['max'] / 1000:.3f} s across {timing['n']} sequential attempts.")
    title += ["", "## Detected disagreements", ""]
    for row in summary["mismatched_proposals"]:
        title += [
            f"- Proposal on-chain ID {row['on_chain_id']} had comparison mismatches {json.dumps(row['fields'], sort_keys=True)} and {row['mismatched_receipts']} mismatched receipts.",
        ]
        title += [
            f"  - `{c['field']}` compared SQL `{c['database']}` with chain `{c['blockchain']}`."
            for c in row["scalar"]
        ]
    assignment_path = run / "assignment_followup.json"
    if assignment_path.exists():
        a = load(assignment_path)
        receipt = a["extra_rows"][0] if len(a["extra_rows"]) == 1 else {}
        title += [
            "",
            f"Proposal 32 had {a['sql_active_distinct']} distinct active SQL members and {a['contract_assigned_count']} contract assignments. The returned events reconstructed {a['reconstructed_count']} members from {a['assigned_events']} assignments and {a['unassigned_events']} unassignments. One SQL-only row had no linked event evidence. Its referenced receipt returned status `{receipt.get('receipt_status')}` at block {receipt.get('receipt_block')} with {receipt.get('receipt_log_count')} logs. The provider's block hash agreed with the receipt. The archived decoded call links it to the assignment operation. The evidence supports a persistent SQL-side inconsistency relative to the observed chain. It leaves the exact historical writer unresolved.",
        ]
    title += [
        "",
        "## Interpretation limits",
        "",
        f"C7 used one chain pin ({check.get('block_number')}) and contemporary repeatable-read SQL. The archived run used 27 distinct pins and an earlier SQL observation. Outcome transitions are descriptive. A single RPC provider supplied chain state, events and receipt confirmation. The experiment cannot establish independent chain integrity or a general accuracy rate. Missing coverage, missing outcome fields and RPC errors remain separately recorded in the CSV and JSON summary.",
        "",
        f"Sources: `reconciliation_39_summary.json`, `reconciliation_39_results.csv`, `{run.name}/assignment_followup.json`, `../springer/reconciliation.jsonl`, `../springer_history/failed_assignment_receipt.json`, and `../failure_diagnosis/ASSIGNMENT_WRITE_PATH.md`.",
    ]
    with (destination / "reconciliation_39_comparison.md").open("x", encoding="utf-8") as out:
        out.write("\n".join(title) + "\n")


if __name__ == "__main__":
    main()
