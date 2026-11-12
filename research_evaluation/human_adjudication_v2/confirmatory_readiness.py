"""Fail closed unless review, adjudication, evidence and manual release are supplied."""
import argparse
import json
from pathlib import Path

from review_import import (PARENT, sha, read_json, read_csv, read_csv_reserved,
                           validate_review, review_state, utc_value)

REQUIRED_FREEZE_ROLES = {
    "cohort_questions", "adjudicated_gold", "evaluation_criteria", "source_documents",
    "proposal_snapshot", "chain_snapshot", "model_configuration", "prompt_templates",
    "source_version", "permissions",
}
CONDITIONS = {"B1", "B2", "B3", "B4", "A1", "A2", "A3", "A4"}


def check(import_dir, freeze_path=None, adapter_path=None, release_path=None):
    reference, _ = read_csv(PARENT / "HUMAN_ANNOTATION_TEMPLATE.csv")
    reserved, _ = read_csv_reserved(PARENT / "RESERVED_133_IDS.csv")
    a = validate_review(import_dir / "reviewer_A.csv", reference)
    b = validate_review(import_dir / "reviewer_B.csv", reference)
    provenance_file = import_dir / "submitted_human_provenance.json"
    resolution_file = import_dir / "submitted_adjudications.csv"
    provenance = read_json(provenance_file) if provenance_file.exists() else None
    state = review_state(reference, reserved, a, b,
                         resolution_file if resolution_file.exists() else None, provenance)
    blockers = []
    recorded = read_json(import_dir / "import.json")
    expected_inputs = {
        "reference_sha256": sha(PARENT / "HUMAN_ANNOTATION_TEMPLATE.csv"),
        "reserved_ids_sha256": sha(PARENT / "RESERVED_133_IDS.csv"),
        "reviewer_A_sha256": a["sha256"], "reviewer_B_sha256": b["sha256"],
    }
    if any(recorded.get(key) != value for key, value in expected_inputs.items()):
        blockers.append("Import reference/reserve/submission hashes changed")
    if not state["independent_human_provenance_verified_by_supplied_coordinator"]:
        blockers.append("Independent human review provenance pending")
    if state["unresolved_reserved_ids"]:
        blockers.append(f"{len(state['unresolved_reserved_ids'])} reserved candidates await disposition")
    cohort = state["eligible_content_ids_pending_freeze"]
    if not cohort:
        blockers.append("No accepted unexposed human-reviewed cohort")
    freeze = read_json(freeze_path) if freeze_path and freeze_path.exists() else {}
    artifacts = freeze.get("artifacts", [])
    if not isinstance(artifacts, list):
        artifacts = []
    roles = set()
    invalid_artifacts = []
    for item in artifacts:
        if not isinstance(item, dict):
            invalid_artifacts.append("invalid artifact entry")
            continue
        role = item.get("role")
        raw_path = item.get("path", "")
        raw_path = raw_path if isinstance(raw_path, str) else ""
        path = Path(raw_path)
        if freeze_path and not path.is_absolute():
            path = freeze_path.parent / path
        if not raw_path or not path.is_file() or sha(path) != item.get("sha256"):
            invalid_artifacts.append(role or "unknown")
        else:
            roles.add(role)
    if (not freeze.get("coordinator_id") or not utc_value(freeze.get("approved_utc", ""))
            or freeze.get("cohort_ids") != cohort
            or not REQUIRED_FREEZE_ROLES <= roles or invalid_artifacts):
        blockers.append("Evidence freeze incomplete, mismatched or not coordinator approved")
    adapter = read_json(adapter_path) if adapter_path and adapter_path.exists() else {}
    conditions = adapter.get("conditions", {})
    if not isinstance(conditions, dict):
        conditions = {}
    conditions = {key: value for key, value in conditions.items() if isinstance(value, dict)}
    if (not CONDITIONS <= conditions.keys()
            or any(conditions[c].get("scientifically_validated") is not True or not conditions[c].get("evidence")
                   for c in CONDITIONS if c in conditions)
            or not adapter.get("source_configuration_sha256")
            or adapter.get("source_configuration_sha256") != freeze.get("source_configuration_sha256")):
        blockers.append("Current baseline and ablation validation pending")
    release = read_json(release_path) if release_path and release_path.exists() else {}
    import_record = import_dir / "import.json"
    expected = {
        "review_import_sha256": sha(import_record),
        "reviewer_A_sha256": a["sha256"], "reviewer_B_sha256": b["sha256"],
        "evidence_freeze_sha256": sha(freeze_path) if freeze_path and freeze_path.exists() else None,
        "adapter_validation_sha256": sha(adapter_path) if adapter_path and adapter_path.exists() else None,
    }
    release_bound = (release.get("confirmatory_release") is True
                     and release.get("coordinator_id") and utc_value(release.get("approved_utc", ""))
                     and all(value and release.get(key) == value for key, value in expected.items()))
    if not release_bound:
        blockers.append("Coordinator manual release absent or not bound to current artifact hashes")
    return {"approved": not blockers, "status": "GO" if not blockers else "NO-GO",
            "accepted_cohort_n": len(cohort), "reserved_screening_n": len(reserved),
            "blockers": blockers,
            "human_provenance_limit": "Coordinator attestation is a human trust input; software cannot authenticate expertise or independence"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-dir", type=Path, required=True)
    parser.add_argument("--freeze", type=Path)
    parser.add_argument("--adapters", type=Path)
    parser.add_argument("--release", type=Path)
    args = parser.parse_args()
    try:
        result = check(args.import_dir, args.freeze, args.adapters, args.release)
    except (ValueError, KeyError, OSError) as error:
        result = {"approved": False, "status": "NO-GO", "blockers": [str(error)]}
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["approved"] else 2)


if __name__ == "__main__":
    main()
