"""Report the isolated recovery follow-up from preserved run records."""
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
PRIOR = HERE.parent / "recovery_m4" / "run-02"
BASE = HERE.parent / "experiment_1_m4" / "run-01"


def read(p):
    return json.loads(p.read_text(encoding="utf-8-sig"))


def records(p):
    return [json.loads(line) for line in p.read_text(encoding="utf-8-sig").splitlines()] if p.exists() else []


def dump(p, data):
    with p.open("x", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def write(p, value):
    with p.open("x", encoding="utf-8") as f:
        f.write(value)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("run", type=Path)
    cli.add_argument("--out", type=Path, default=HERE / "results-01")
    args = cli.parse_args()
    run, out = args.run.resolve(), args.out.resolve()
    config = read(run/"configuration.json")
    recovery = read(run/"recovery.json")
    old_recovery = read(PRIOR/"recovery.json")
    replay = read(run/"replay.json") if (run/"replay.json").exists() else {}
    fixtures = read(run/"reliability-fixtures.json") if (run/"reliability-fixtures.json").exists() else {}
    ranges = records(run/"ranges.jsonl")
    ok_ranges = [r for r in ranges if "error_type" not in r]
    contiguous = bool(ok_ranges) and ok_ranges[0]["from"] == config["from"] and all(
        int(a["to"]) + 1 == int(b["from"]) for a,b in zip(ok_ranges,ok_ranges[1:]))
    initial = read(run/"sql-recovered.json")
    old = {r["on_chain_id"]:r for r in records(PRIOR/"verification.jsonl")}
    baseline = {str(p["on_chain_id"]) for p in read(BASE/"sql_evidence.local.json")["proposals"]}
    observed = records(run/"verification.jsonl")
    new = {r["on_chain_id"]:r for r in observed}
    recovered = {str(p["on_chain_id"]):p for p in initial["proposals"]}
    if len(new) != len(observed) or set(new) - set(recovered) or len(baseline) != 39 or set(old) != baseline:
        raise ValueError("Duplicate rows or unexpected cohort")
    done = (run/"completed.json").exists() and set(new) == set(recovered)
    fields = ["winning_option", "tied", "public.proposal_assignments.count", "public.votes.count",
              "governance_events.historical_coverage"]
    outcomes = ("verified","mismatched","unverified","unavailable","failed","not_attempted")
    before, after, transitions, scanned, field_outcomes = Counter(), Counter(), Counter(), Counter(), Counter()
    rows = []
    for key in sorted(baseline | set(recovered), key=int):
        a, b = old.get(key, {}), new.get(key, {})
        prior_status, status = a.get("status","not_attempted"), b.get("status","not_attempted")
        if key in baseline:
            before[prior_status] += 1
            after[status] += 1
        transitions[prior_status,status] += 1
        report = b.get("report",{})
        scan = report.get("event_scan",{})
        checks = {c["field"]:c for c in report.get("comparisons",[])}
        for c in report.get("comparisons",[]):
            field_outcomes[c["field"].split(":",1)[0],c["status"]] += 1
        scanned[scan.get("status","not_attempted")] += 1
        row = {
            "on_chain_id":key,"in_original_cohort":key in baseline,"recovered":key in recovered,
            "prior_outcome":prior_status,"new_outcome":status,"pin":report.get("block_number"),
            "checkpoint":report.get("indexer_checkpoint",{}).get("processed_block_number"),
            "scan_status":scan.get("status"),"scan_from":scan.get("from_block"),
            "scan_through":scan.get("scanned_through"),"scan_ranges":scan.get("completed_ranges"),
            "scan_next":scan.get("next_block"),"scan_reason":scan.get("reason"),
            "service_errors":json.dumps(report.get("errors",[])), "error_type":b.get("error_type"),
            "verification_ms":b.get("wall_ms"),
        }
        row.update({field:checks.get(field,{}).get("status") for field in fields})
        rows.append(row)
    if any(r.get("report",{}).get("block_hash") not in {config["pin_hash"],None} for r in observed):
        raise ValueError("Unexpected pinned hash")
    out.mkdir()
    with (out/"RECOVERY_COMPARISON.csv").open("x",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    med = median([r["wall_ms"] for r in observed]) if observed else 0
    checkpoint = recovery["checkpoints"][0]
    counts = recovery["counts"]
    finals = [p for p in recovered.values() if p["status"]=="FINALIZED"]
    projected = sum(p["winning_option"] is not None and p["tied"] is not None for p in finals)
    statuses = "\n".join(f"| {status} | {before[status]} | {after[status]} |" for status in outcomes)
    changes = "\n".join(f"| {a} | {b} | {n} |" for (a,b),n in sorted(transitions.items()))
    report = f"""# Recovery completeness follow-up

The run is **{'complete' if done else 'incomplete'}**. The existing CyberDAO recovery use case reconstructed {len(set(recovered)&baseline)}/39 original proposals, with {len(set(recovered)-baseline)} additional proposals. PostgreSQL ran in a new database inside the dedicated loopback container. The experiment used block {config['pin']} on chain {config['chain_id']}, with hash `{config['pin_hash']}`. Recovery and reconciliation used one RPC provider. No second independently operated endpoint was configured, so cross-provider validation was unavailable.

| Original cohort outcome | Prior recovery | Follow-up |
|---|---:|---:|
{statuses}

| Prior outcome | Follow-up outcome | Proposals |
|---|---|---:|
{changes}

The recovery pass recorded {counts['proposal_assignments']} assignment rows, {counts['votes']} votes, and {counts['governance_events']} governance events. It took {recovery['wall_ms']/1000:.3f} s, compared with {old_recovery['wall_ms']/1000:.3f} s previously. These are single-run timings. C7 attempted {len(new)} proposals at concurrency three, with median per-proposal wall time {med/1000:.3f} s.

C7 reported scan statuses `{json.dumps(dict(scanned),sort_keys=True)}`. Recovery projected winner and tie fields for {projected}/{len(finals)} finalized proposals. C7 compared the recovered fields with pinned contract storage through the same provider. It verified {field_outcomes['winning_option','verified']} winner and {field_outcomes['tied','verified']} tie comparisons. Non-finalized proposals do not require these fields. Proposal 32 outcome: {new.get('32',{}).get('status','not attempted')}. Its recovered active assignment count is {sum(a['assigned'] for a in initial['proposal_assignments'] if a['proposal_id']==recovered['32']['id'])}.

## Code changes and regression evidence

- C7 processes contiguous 1,000-block pages in ordered windows of eight, bounded to 5,000 pages and 10,000 distinct logs. It checks a 75-second budget before starting each window and retains the SDK's 15-second per-call timeout. The last contiguous completed block and next unchecked block are recorded. Failed pages cannot become covered by later successful responses.
- Log pages reject malformed or out-of-range entries and conflicting duplicates. Accepted logs are deduplicated and ordered by block and log index. The two-million-block cutoff is replaced by a five-million-block ceiling. Coverage remains partial when a budget is reached. C7 calls do not persist resumable scan sessions. The next-block diagnostic identifies where the scan stopped, while the recovery indexer retains its durable cursor.
- The recovery gateway rejects a returned governance event with a missing or unsuccessful receipt. Recovery validates range membership, sorts and deduplicates events, and advances the cursor only after processing a page. A reported empty page still cannot establish that the provider returned every event.
- Recovery persists finalization winner, tie, total votes and event timestamp via the existing PostgreSQL finalization method. It rejects invalid or missing finalization fields without advancing the page checkpoint. An optional repository method preserves compatibility with repositories that only store status.

**55 C7**, **23 application** and **19 blockchain adapter** tests passed. The API build passed after correcting a TypeScript error. A runner started after the failed build was stopped and excluded because it could have loaded stale JavaScript. Its isolated output and exclusion record are retained separately. Two full replays of the successful run were stable on tested projection keys: {[r['stable'] for r in replay.get('replayResults',[])]}. Four PostgreSQL reliability fixture observations are recorded, including timeout/resume, duplicate delivery and silent omission.

## Manuscript interpretation

Use these outcomes as a versioned follow-up at the same pin and roster. The experiment measures recovery and same-provider consistency under documented checks. It cannot establish independent blockchain integrity, prove a provider returned every event, or recover application-only data. The earlier 24/15 outcome remains the result of the previous implementation.
"""
    write(out/"RECOVERY_COMPLETENESS_REPORT.md",report)
    missing_fixture = next((r for r in fixtures.get("results",[]) if r["case"]=="silent_missing_rpc_event"),{})
    checkpoint_report = f"""# Recovery checkpoint analysis

| Recorded property | Value |
|---|---|
| Writer and verifier version | {checkpoint['indexer_version']} |
| Deployment start block | {config['from']} |
| Pinned target block | {config['pin']} |
| Successful gateway ranges | {len(ok_ranges)} |
| Gateway range errors | {len(ranges)-len(ok_ranges)} |
| Range sequence contiguous from deployment | {contiguous} |
| Last gateway range end | {ok_ranges[-1]['to'] if ok_ranges else 'Unavailable'} |
| Persisted checkpoint | {checkpoint['processed_block_number']} |
| Persisted checkpoint hash | {checkpoint['processed_block_hash']} |

Recovery writes the cursor after applying each page. The cursor records **scan progress**. It does not certify provider completeness. An RPC error, invalid page, mismatched range, failed receipt or rejected projection prevents that page's cursor advance. The controlled timeout left the prior checkpoint in place, and an incremental retry began at the first failed range. Recovery can have earlier idempotent writes from a failed page because its evidence and projections do not share one all-or-nothing transaction with the cursor.

The controlled omission fixture removed one expected assignment but returned a successful page. The resulting checkpoint was {missing_fixture.get('observed',{}).get('checkpoint','Unavailable')}, with {missing_fixture.get('observed',{}).get('counts',{}).get('proposal_assignments','Unavailable')} stored assignment rows. The observed coverage label was `{missing_fixture.get('coverage','unavailable')}`. A same-provider state comparison can expose some omissions through count or state discrepancies. A successful empty response or agreement on aggregate state can still conceal omissions, especially events with no net state change.

C7 separately records each proposal's contiguous scan interval and completion reason. A timeout or missing range cannot be counted as verified history. The C7 current-checkpoint field establishes the height check only. The writer does not store an anchor hash, and the experiment separately checked the common block hash at the provider. No independently operated second endpoint was available.
"""
    write(out/"RECOVERY_CHECKPOINT_ANALYSIS.md",checkpoint_report)
    inputs = [p for p in HERE.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    inputs += [PRIOR/"recovery.json",PRIOR/"verification.jsonl",BASE/"sql_evidence.local.json",
               BASE/"configuration.json", *[ROOT/file for file in config["sources"]],
               ROOT/"packages/application/src/ports/proposal-repository.ts",
               ROOT/"packages/application/test/sync-governance.use-case.test.ts",
               ROOT/"apps/api/src/ai/__tests__/blockchain-verification.spec.ts"]
    for file, expected in config["sources"].items():
        if sha(ROOT/file)!=expected:
            raise ValueError(f"Execution source changed after launch: {file}")
    dump(out/"RECOVERY_REPRODUCIBILITY_MANIFEST.json",{
        "generated_utc":datetime.now(timezone.utc).isoformat(),"complete":done,
        "configuration":config,"expected":39,"attempted":len(new),"prior_outcomes":dict(before),
        "outcomes":{status:after[status] for status in outcomes},"scan_outcomes":dict(scanned),
        "second_independent_endpoint_available":False,
        "finished":read(run/"completed.json") if done else None,
        "test_counts":{"c7":55,"application":23,"gateway":19},
        "files":{p.relative_to(ROOT).as_posix():sha(p) for p in sorted(set(inputs))},
    })
    print(json.dumps({"complete":done,"attempted":len(new),"outcomes":dict(after),"scan":dict(scanned),
                      "finalized_fields":f"{projected}/{len(finals)}"}))


if __name__ == "__main__":
    main()
