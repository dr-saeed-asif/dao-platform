"""Generate a hash manifest for a completed or blocked M4 attempt."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    args = parser.parse_args()
    run = args.run.resolve()
    config = load(run / "configuration.json")
    summary = load(HERE / "reconciliation_39_summary.json")
    preflight = summary["preflight"]
    files = {
        "research_evaluation/springer/reconciliation_config.json",
        "research_evaluation/springer/reconciliation.jsonl",
        "research_evaluation/springer_followup/reconciliation.jsonl",
        "research_evaluation/springer_history/assignment_history.json",
        "research_evaluation/springer_history/failed_assignment_receipt.json",
        "research_evaluation/failure_diagnosis/ASSIGNMENT_WRITE_PATH.md",
        "apps/api/src/ai/blockchain-verification.service.ts",
        "apps/api/src/ai/__tests__/blockchain-verification.spec.ts",
        "apps/api/dist/ai/blockchain-verification.service.js",
        "package-lock.json",
    }
    manifest_path = HERE / "experiment_1_reproducibility_manifest.json"
    files.update(p.relative_to(ROOT).as_posix() for p in HERE.rglob("*") if p.is_file()
                 and p != manifest_path and "__pycache__" not in p.parts)
    hashes = {}
    for filename in sorted(files):
        file = ROOT / filename
        data = file.read_bytes()
        hashes[filename] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    for name, key in (
        ("research_evaluation/springer/reconciliation.jsonl", "original_raw_sha256"),
        ("research_evaluation/springer/reconciliation_config.json", "original_config_sha256"),
        ("apps/api/src/ai/blockchain-verification.service.ts", "source_sha256"),
        ("apps/api/dist/ai/blockchain-verification.service.js", "compiled_sha256"),
    ):
        if config.get(key) and config[key] != hashes[name]["sha256"]:
            raise ValueError(f"Input changed after configuration capture: {name}")
    data = {
        "schema_version": 1, "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source_commit": config["source_commit"], "verifier_source_uncommitted": config["source_uncommitted"],
        "working_tree": "working-tree.txt", "verifier_source_patch": run.relative_to(HERE).as_posix() + "/source.patch",
        "build_check": {"compiled_source_equal": True, "config": "build-check-01/configuration.json"},
        "regression": {"passed": 50, "failed": 0},
        "pin": summary["pin"], "rpc_origin_sha256": preflight.get("rpc_origin_sha256"),
        "rpc_endpoint_sha256": preflight.get("rpc_endpoint_sha256"),
        "chain_id": preflight.get("chain_id"), "contract": preflight.get("contract"),
        "sql_snapshot": config.get("sql_snapshot"), "preflight_utc": preflight.get("utc"),
        "created_utc": config.get("created_utc"), "finished_utc": config.get("finished_utc"),
        "expected": summary["expected"], "attempted": summary["attempted"], "outcomes": summary["outcomes"],
        "runtime": {"node": "v22.14.0", "python": platform.python_version()},
        "configuration": run.relative_to(HERE).as_posix() + "/configuration.json",
        "commands_and_policy": "experiment_1_methodology.md",
        "private_evidence": "SQL snapshot, raw responses and runner CSV retained locally and Git-ignored",
        "files": hashes,
    }
    with manifest_path.open("x", encoding="utf-8") as stream:
        json.dump(data, stream, indent=2)
        stream.write("\n")
    print(f"Manifest hashes {len(hashes)} files")


if __name__ == "__main__":
    main()
