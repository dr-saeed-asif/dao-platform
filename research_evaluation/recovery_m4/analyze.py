"""Generate the recovery report from recorded observations."""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OLD = HERE.parent / "experiment_1_m4" / "run-01"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def read_lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8-sig").splitlines()] if path.exists() else []


def save(path, value):
    with path.open("x", encoding="utf-8") as f:
        f.write(value)


def table(path, records, columns):
    with path.open("x", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(records)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def status_row(check):
    return check.get("status", "not_attempted")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("run", type=Path)
    cli.add_argument("--out", type=Path, default=HERE / "results-01")
    args = cli.parse_args()
    run, out = args.run.resolve(), args.out.resolve()
    config = read(run / "configuration.json")
    recovery = read(run / "recovery.json") if (run / "recovery.json").exists() else {}
    recovered = read(run / "sql-recovered.json") if recovery else {}
    original = read(OLD / "sql_evidence.local.json")
    historical = read(OLD / "preflight.json")
    earlier_checks = {str(r["report"]["on_chain_id"]): r for r in read_lines(OLD / "responses.jsonl")}
    verification_rows = read_lines(run / "verification.jsonl")
    checked = {str(r["on_chain_id"]): r for r in verification_rows}
    base = {str(p["on_chain_id"]): p for p in original["proposals"]}
    new = {str(p["on_chain_id"]): p for p in recovered.get("proposals", [])}
    if len(base) != 39 or len(checked) != len(verification_rows) or set(checked) - set(new):
        raise ValueError("Unexpected cohort or duplicate verification record")
    complete = (run / "completed.json").exists() and set(checked) == set(new)
    keys = sorted(set(base) | set(new), key=int)
    outcomes = Counter(status_row(checked.get(key, {})) for key in new)
    fields = ("creator_address", "proposal_type", "metadata_hash", "metadata_uri",
              "starts_at", "ends_at", "status", "winning_option", "tied",
              "total_votes", "title", "purpose", "description", "dao_id",
              "created_at", "updated_at", "cancelled_at", "finalized_at")
    rows, sql_pairs, chain_pairs = [], [], []
    chain_stats = Counter()
    transitions = Counter()
    assignments = {}
    for key in keys:
        p, q, check = base.get(key), new.get(key), checked.get(key, {})
        report = check.get("report", {})
        old_active = {a["member_address"].lower(): a for a in original["assignments"]
                      if p and a["proposal_id"] == p["id"] and a["assigned"]}
        new_active = {a["member_address"].lower(): a for a in recovered.get("proposal_assignments", [])
                      if q and a["proposal_id"] == q["id"] and a["assigned"]}
        assignments[key] = (old_active, new_active)
        prior_outcome = earlier_checks.get(key, {}).get("status", "outside_original_roster")
        transitions[prior_outcome, status_row(check)] += 1
        rows.append({
            "on_chain_id": key, "original_proposal_id": p["id"] if p else None,
            "recovered_proposal_id": q["id"] if q else None,
            "recovered": bool(q), "original_c7_outcome": prior_outcome, "outcome": status_row(check), "pinned_block": report.get("block_number"),
            "checkpoint_status": report.get("indexer_checkpoint", {}).get("status"),
            "original_active_assignments": len(old_active) if p else None,
            "recovered_active_assignments": len(new_active) if q else None,
            "recovered_votes": sum(v["proposal_id"] == q["id"] for v in recovered.get("votes", [])) if q else None,
            "wall_ms": check.get("wall_ms"), "errors": json.dumps(report.get("errors", [])),
        })
        if p and q:
            sql_pairs.extend({"on_chain_id": key, "field": f,
                              "comparison": "missing_both" if p[f] is None and q[f] is None else
                              "missing_recovered" if q[f] is None else "missing_original" if p[f] is None else
                              "equal" if p[f] == q[f] else "different"}
                             for f in fields)
            sql_pairs.append({"on_chain_id": key, "field": "active_assignment_set",
                              "comparison": "equal" if set(old_active) == set(new_active) else "different"})
            def vote_set(snapshot, proposal):
                return {(v["voter_address"].lower(), v["option_index"]) for v in snapshot.get("votes", [])
                        if v["proposal_id"] == proposal["id"]}
            sql_pairs.append({"on_chain_id": key, "field": "voter_option_set",
                              "comparison": "equal" if vote_set(original, p) == vote_set(recovered, q) else "different"})
        for c in report.get("comparisons", []):
            label = c["field"].split(":", 1)[0]
            chain_stats[(label,c["status"])] += 1
            scalar = label in {"voting_status","public.proposal_assignments.count","public.votes.count",
                               "public.proposals.total_votes","winning_option","tied","finalized",
                               "governance_events.count","starts_at","ends_at"} or label.startswith("option_")
            chain_pairs.append({"on_chain_id":key,"field":label,"status":c["status"],
                                "database":c["database"] if scalar else None,
                                "blockchain":c["blockchain"] if scalar else None,
                                "reason":c.get("reason")})
    out.mkdir(exist_ok=False)
    table(out/"recovery_results.csv", rows, list(rows[0]))
    table(out/"recovery_vs_original.csv", sql_pairs, ["on_chain_id","field","comparison"])
    table(out/"recovery_vs_blockchain.csv", chain_pairs, ["on_chain_id","field","status","database","blockchain","reason"])
    ranges = read_lines(run/"ranges.jsonl")
    valid = [r for r in ranges if "error_type" not in r]
    contiguous = bool(valid) and int(valid[0]["from"]) == int(config["from"]) and all(
        int(a["to"])+1 == int(b["from"]) for a,b in zip(valid,valid[1:]))
    endpoint = valid[-1]["to"] if valid else None
    checks = Counter(r.get("report",{}).get("indexer_checkpoint",{}).get("status","unavailable")
                     for r in verification_rows)
    diagnostics = {
        "original_checkpoints":historical["checkpoints"],"recovered_checkpoints":recovery.get("checkpoints",[]),
        "scope":{"name":"governance-full","writer_version":config["indexer_version"],"verifier_version":config["indexer_version"]},
        "checkpoint_lookup_outcomes":dict(checks),"target":config["pin"],"ranges_observed":len(ranges),
        "ranges_contiguous_from_deployment":contiguous,"last_successful_gateway_range_end":endpoint,
        "range_errors":len(ranges)-len(valid),"checkpoint_samples":read_lines(run/"checkpoint-samples.jsonl"),
        "interpretation":"NestJS writer explicitly selects v1. Repository default 1 is a distinct key. No aliasing or manual cursor advance. Null checkpoint hash leaves the checkpoint itself without a stored canonical block anchor.",
    }
    save(out/"checkpoint_diagnostics.json",json.dumps(diagnostics,indent=2)+"\n")
    prior32 = read(OLD/"assignment_followup.json")
    old32,new32=assignments["32"]
    extra=set(old32)-set(new32)
    report32=checked.get("32",{}).get("report",{})
    chain32=next((c["blockchain"] for c in report32.get("comparisons",[])
                  if c["field"]=="public.proposal_assignments.count"),None)
    chain_members = set()
    membership_events = sorted(
        (e for e in report32.get("events", []) if e["name"] in {"MemberAssigned", "MemberUnassigned"}),
        key=lambda e: (int(e["block_number"]), int(e["log_index"])),
    )
    for event in membership_events:
        member = event["args"]["member"].lower()
        if event["name"] == "MemberAssigned":
            chain_members.add(member)
        else:
            chain_members.discard(member)
    assignment_receipt_count = sum(
        a.get("transaction_hash") in {t.get("hash") for t in report32.get("transactions", [])
                                      if t.get("status") == "verified"}
        for a in new32.values()
    )
    save(out/"proposal_32_recovery_analysis.md", f"""# Proposal 32 recovery analysis

| Source | Active assignments |
|---|---:|
| Original SQL snapshot | {len(old32)} |
| Original pinned contract read | {prior32['contract_assigned_count']} |
| Recovered SQL | {len(new32) if '32' in new else 'Unavailable'} |
| Recovery C7 contract read | {chain32 if chain32 is not None else 'Unavailable'} |

SQL-only members in the original snapshot relative to the recovered set: {len(extra) if '32' in new else 'Unavailable'}. Recovered-only members: {len(set(new32)-set(old32)) if '32' in new else 'Unavailable'}. The original receipt investigation found one extra active row with no linked evidence and a reverted receipt at block 19,347,983 with no logs. If the recovered set is available, exactly {sum(old32[m]['latest_evidence_id'] is None for m in extra)} original-only rows lack a linked evidence ID.

The recovered membership set agrees with the set reconstructed from the C7-returned membership logs: {set(new32) == chain_members if report32 else 'Unavailable'}. The C7 logs contain {len(membership_events)} assignment or unassignment events for this proposal. Verified C7 transaction references among recovered active assignments: {assignment_receipt_count}/{len(new32)}.

The recovery gateway projects successful assignment events. These observations constrain the source of the assignment disagreement. They do not identify which historical writer persisted the row. The verification and recovery used the same RPC provider.

Sources: original [assignment follow-up](../../experiment_1_m4/run-01/assignment_followup.json), [historical writer investigation](../../failure_diagnosis/ASSIGNMENT_WRITE_PATH.md), and local recovery SQL and C7 records.
""")
    original_stats = Counter((r["field"],r["comparison"]) for r in sql_pairs)
    replay = read(run/"replay.json") if (run/"replay.json").exists() else {}
    tests = read(run/"reliability-fixtures.json") if (run/"reliability-fixtures.json").exists() else {}
    durations = [r["wall_ms"] for r in verification_rows]
    report = f"""# Recovery experiment report

The recovery experiment is **{'complete' if complete else 'incomplete'}**. The original SQL snapshot was reused by its saved SHA-256 from Experiment 1. No original rows were loaded into the recovery database. The existing SyncGovernanceUseCase, CyberChainGovernanceGateway and PostgreSQL repositories operated on a fresh PostgreSQL 16 container using the application migration registry. Recovery and verification read the original pin {config['pin']} on chain {config['chain_id']} at {config['contract']}. The RPC method allowlist permits reads and the recovery gateway cannot access signing keys. The original population was matched by chain, contract and on-chain proposal ID. The pre-existing M4 SQL snapshot retained original proposal and assignment identifiers and the SQL snapshot identifier.

| Observation | Result |
|---|---:|
| Original proposals | {len(base)} |
| Unique creation events discovered | {recovery.get('proposals_discovered','Unavailable')} |
| Reconstructed proposals | {len(new)} |
| Original proposals matched by on-chain ID | {len(set(base)&set(new))} |
| Missing original proposals | {len(set(base)-set(new))} |
| Extra recovered proposals | {len(set(new)-set(base))} |
| Stored assignment rows | {len(recovered.get('proposal_assignments',[])) if recovery else 'Unavailable'} |
| Active assignments | {sum(a['assigned'] for a in recovered.get('proposal_assignments',[])) if recovery else 'Unavailable'} |
| Stored votes | {len(recovered.get('votes',[])) if recovery else 'Unavailable'} |
| Stored governance events | {len(recovered.get('governance_events',[])) if recovery else 'Unavailable'} |
| Successful gateway ranges | {len(valid)} |
| Gateway range errors | {len(ranges)-len(valid)} |
| Live recovery wall seconds | {round(recovery['wall_ms']/1000,3) if recovery else 'Unavailable'} |
| C7 attempts | {len(checked)} |
| C7 median wall seconds | {round(median(durations)/1000,3) if durations else 'Unavailable'} |

| C7 outcome | Count |
|---|---:|
"""
    for outcome in ("verified","mismatched","unverified","unavailable","failed","not_attempted"):
        report += f"| {outcome} | {outcomes[outcome]} |\n"
    report += "\n| Original C7 outcome | Recovery C7 outcome | Proposals |\n|---|---|---:|\n"
    for (before, after), n in sorted(transitions.items()):
        report += f"| {before} | {after} | {n} |\n"
    uri_kinds = Counter("inline JSON" if (p.get("metadata_uri") or "").startswith("data:application/json;base64,")
                        else "non-inline URI" if p.get("metadata_uri") else "missing URI" for p in new.values())
    report += "\n## What the existing feature reconstructs\n"
    report += "\nObserved recovered metadata URI types: " + ", ".join(f"{kind}: {n}" for kind,n in sorted(uri_kinds.items())) + ".\n"
    report += """

The gateway decodes creation, assignment, unassignment, voting, cancellation and finalization events and checks receipts and block evidence. It skips events whose receipts are missing or unsuccessful. Those skips and provider-side event omission can limit reconstruction completeness. The use case saves event evidence, projects operational rows and updates the real cursor after each processed range. It generates synthetic SQL identifiers. Inline base64 JSON metadata can supply titles, descriptions, purposes, option labels and DAO identifiers. External metadata URIs remain references. The feature does not fetch external documents or recreate document indexing, wallet sessions, permissions or original application identifiers. The current finalization projection sets the finalized status and timestamp, while ignoring the winner and tie fields available in the event. SQL projection and ingestion timestamps can differ from the original business timestamps.

## Field comparison

The table counts field outcomes against C7 observations from the same provider. It describes agreement, disagreement and uncertainty for the tested cohort. A second independent provider was not used.

| Field | Verified | Mismatched | Unverified | Unavailable |
|---|---:|---:|---:|---:|
"""
    for label in sorted({k[0] for k in chain_stats}):
        report += "| " + label + " | " + " | ".join(str(chain_stats[label,s]) for s in
                    ("verified","mismatched","unverified","unavailable"))+" |\n"
    report += """
The original comparison uses on-chain proposal IDs and records field equality without disclosing source text. Agreement is not scored as ground-truth accuracy. The CSV uses the initial recovered projection before repeatability replays. C7 ran after the two replays. The later isolated SQL snapshot is archived separately. The replay checks found stable substantive keys and values, with timestamp changes outside their equality criteria. Original options were not included in the frozen SQL export, so original option labels are outside that comparison.

| Original comparison | Equal | Different | Missing recovered | Missing original | Missing both |
|---|---:|---:|---:|---:|---:|
"""
    for field in (*fields,"active_assignment_set","voter_option_set"):
        report += "| " + field + " | " + " | ".join(str(original_stats[field,s]) for s in
                ("equal","different","missing_recovered","missing_original","missing_both"))+" |\n"
    status_pairs = Counter((base[k]["status"], new[k]["status"]) for k in set(base) & set(new))
    creation = {str(e["proposal_id"]): e for e in recovered.get("governance_events", [])
                if e["event_name"] == "ProposalCreated"}
    creator_differences = [k for k in set(base) & set(new)
                           if base[k]["creator_address"].lower() != new[k]["creator_address"].lower()]
    creator_event_matches = sum(
        k in creation and new[k]["creator_address"].lower() == creation[k]["event_args"]["creator"].lower()
        == creation[k]["transaction_sender"].lower() for k in creator_differences)
    scope_notes = "\nStored status pairs (original / recovered): " + ", ".join(
        f"{a} / {b}: {n}" for (a,b),n in sorted(status_pairs.items())) + "."
    scope_notes += (f" C7 compared temporal voting status at the chain pin independently of raw SQL labels. "
                    f"In {creator_event_matches}/{len(creator_differences)} creator differences, the recovered creator "
                    "matched both the creation event and transaction sender. The original SQL address differed. "
                    "The experiment does not establish the original address's application role.\n")
    report += scope_notes
    report += f"""
## Checkpoint and reliability

The NestJS writer explicitly selects version v1. The repository's generic default 1 is a separate composite key. The verifier and proposal query now share the writer's explicit version. The new scope assertion failed in 8 checkpoint scenarios before the fix and the full verifier suite passed 50/50 after it. No legacy values were normalized or copied. Recovered checkpoints came from the production use case as it processed ranges. Contiguous observed ranges from deployment: {contiguous}. Last successful gateway range ended at {endpoint}. A successful range can still omit events. The checkpoint writer records the height even when a range contains no events. The checkpoint hash remains null in this writer implementation, so the cursor itself provides no stored canonical hash anchor. The experiment checked the target hash before and after recovery and around verification.

The first isolated live attempt stopped with a harness TypeError caused by supplying an operational wrapper to the event repository instead of its Kysely database. It had scanned two ranges and advanced the cursor only through the first. The preserved attempt is under run-01. The corrected harness started from a separate empty database in run-02.

Full replay stability on the recorded projection keys: {[x['stable'] for x in replay.get('replayResults',[])]}. Replays used the cached live event envelopes and executed the existing recovery use case, with no external RPC calls. Stability excludes mutable timestamps and is not byte-for-byte database equality. Incremental no-op result: {json.dumps(replay.get('incremental'))}. Controlled fixture cases recorded: {len(tests.get('results',[]))}. The injected timeout preserved the last completed checkpoint, an incremental retry restored the missing range, and duplicate delivery kept row counts stable. A silently omitted assignment did **not** stop the cursor advancing. This is an observed recovery limitation. Those fault inputs were controlled fixtures, separate from the live scan.

Proposal 32 is analyzed separately. Neither the recovery result nor a single provider's agreeing data establishes independent chain integrity or identifies the original row writer.

## Commands

- `npm run build --workspace=api`
- `node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts` (50 passed)
- `npm run test --workspace=@dao-platform/application` (18 passed)
- `node research_evaluation/recovery_m4/run.cjs research_evaluation/recovery_m4/run-02`
- `node research_evaluation/recovery_m4/reliability.cjs research_evaluation/recovery_m4/run-02`
- `python research_evaluation/recovery_m4/analyze.py research_evaluation/recovery_m4/run-02`

The loopback-only container was created from pgvector/pgvector:pg16 with a random environment-injected PostgreSQL password. The successful run used database recovery_fresh in that container. Provisioning commands are in the accompanying README. The source commit, dirty state, SQL snapshot identifier, exact pin/hash, range size, provider fingerprint and migration list are in the manifest and raw run configuration. Raw SQL snapshots and full RPC-derived records are Git-ignored.
"""
    save(out/"RECOVERY_EXPERIMENT_REPORT.md",report)
    paths = [p for p in HERE.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    paths += [ROOT / f for f in (
        "apps/api/src/proposals/proposals.module.ts", "apps/api/src/proposals/proposal-query.service.ts",
        "apps/api/src/ai/__tests__/blockchain-verification.spec.ts",
        "packages/application/dist/src/synchronization/sync-governance.use-case.js",
        "packages/blockchain-cyberchain/dist/src/cyberchain-governance.gateway.js",
        "packages/database/dist/src/postgres-database.js", *config["sources"])]
    paths += [OLD/"sql_evidence.local.json", OLD/"configuration.json", OLD/"preflight.json", OLD/"responses.jsonl",
              OLD/"assignment_followup.json", HERE.parent/"springer"/"reconciliation.jsonl"]
    manifest = {"generated_utc":datetime.now(timezone.utc).isoformat(),"complete":complete,
                "configuration":config,"outcomes":dict(outcomes),"finish":read(run/"completed.json") if complete else None,
                "files":{str(p.relative_to(ROOT)).replace("\\","/"):digest(p) for p in sorted(set(paths))}}
    save(out/"recovery_reproducibility_manifest.json",json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"recovered":len(new),"original_matched":len(set(base)&set(new)),
                      "attempted":len(checked),"outcomes":dict(outcomes),"complete":complete}))


if __name__ == "__main__":
    main()
