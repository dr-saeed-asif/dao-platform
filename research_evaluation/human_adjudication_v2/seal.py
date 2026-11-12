"""Hash the review-workflow artifacts and verify previous research preservation."""
from datetime import datetime, timezone
import csv
import hashlib
import json
from pathlib import Path
import platform
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PARENT = HERE.parent / "ai_independent_part2_v1"
AI = Path(r"E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    prior = json.loads((PARENT / "AI_REPRODUCIBILITY_MANIFEST.json").read_text())
    for name, expected in prior["files"].items():
        file = AI / name[3:] if name.startswith("ai/") else ROOT / name
        if sha(file) != expected:
            raise ValueError(f"Prior artifact/source changed: {name}")
    state = json.loads((HERE / "READINESS.json").read_text(encoding="utf-8-sig"))
    assert state["approved"] is False and state["status"] == "NO-GO"
    report = json.loads((HERE / "imports/blank-preflight-02/import.json").read_text())
    assert report["reviewer_A_complete"] == report["reviewer_B_complete"] == 0
    assert report["agreement"] is None and report["reserved_candidates"] == 133
    assert not list(HERE.rglob("HUMAN_AGREEMENT_REPORT.md"))
    with (HERE / "imports/blank-preflight-02/adjudication_tracking.csv").open(encoding="utf-8", newline="") as stream:
        items = list(csv.DictReader(stream))
    assert len(items) == 226 and sum(row["in_reserved_133"] == "True" for row in items) == 133
    required = ["HUMAN_REVIEW_INSTRUCTIONS.md", "ANNOTATION_IMPORT_REPORT.md",
                "BENCHMARK_FREEZE_CHECKLIST.md", "BASELINE_ADAPTER_VALIDATION.md",
                "CONFIRMATORY_RUN_READINESS.md"]
    assert all((HERE / name).is_file() for name in required)
    inputs = [
        PARENT / "HUMAN_ANNOTATION_TEMPLATE.csv",
        PARENT / "annotation/reviewer_A/HUMAN_ANNOTATION_TEMPLATE.csv",
        PARENT / "annotation/reviewer_B/HUMAN_ANNOTATION_TEMPLATE.csv",
        PARENT / "annotation/proposed_gold_reference.json", PARENT / "RESERVED_133_IDS.csv",
        PARENT / "AI_REPRODUCIBILITY_MANIFEST.json", PARENT / "assess_reviews.py",
        PARENT / "PROPOSED_CONDITIONS.json",
        HERE.parent / "benchmark_200/questions.json",
        HERE.parent / "benchmark_200/ground_truth.json",
        HERE.parent / "benchmark_200/evidence/snapshot.json",
        HERE.parent / "benchmark_200/review/independent_audit/independent_adjudication.json",
        HERE.parent / "exploratory_frozen_v2/exposure_ledger.json",
        HERE.parent / "harness_validation_v1/single_agent_candidate_v3.py",
        HERE.parent / "benchmark_200/scripts/run.py",
    ]
    path = HERE / "REPRODUCIBILITY_MANIFEST.json"
    package = [p for p in HERE.rglob("*") if p.is_file() and p != path and "__pycache__" not in p.parts]
    hashes = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(set(inputs + package))}
    for file in ("app/business/agents/claims.py", "app/business/agents/workflow.py",
                 "app/business/agents/synthesis.py", "app/business/agents/quality.py"):
        hashes["ai/" + file] = sha(AI / file)
    metadata = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "classification": "Human review preparation, blank imports and offline adapter validation",
        "prior_manifest_files_verified": len(prior["files"]),
        "review_pool": 226, "reserved_subset": 133, "complete_human_pairs": 0,
        "approved_confirmatory_cohort": 0, "human_agreement_report_generated": False,
        "model_generations": 0, "network_calls": 0, "production_changes": 0,
        "software_tests": {"import_readiness": 12, "offline_adapter_checks": 9},
        "readiness": state,
        "runtime_python": platform.python_version(),
        "git_bases": {label: subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
                      for label, repo in (("dao", ROOT), ("ai", AI))},
        "current_sources_are_uncommitted": True,
        "commands": [
            "python review_import.py --reviewer-a <existing A> --reviewer-b <existing B> --out <new import version>",
            "python confirmatory_readiness.py --import-dir imports/blank-preflight-02 --freeze <draft template> --adapters adapter_validation.json --release <draft template> (expected exit 2)",
            "python -m unittest discover -s research_evaluation/human_adjudication_v2 -p test_review_import.py",
            "<AI virtualenv Python> -m unittest discover -s research_evaluation/human_adjudication_v2 -p test_adapters.py",
            "python -m py_compile review_import.py confirmatory_readiness.py test_review_import.py test_adapters.py",
            "python seal.py",
        ],
        "files": hashes,
    }
    with path.open("x", encoding="utf-8") as stream:
        json.dump(metadata, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"files_hashed": len(hashes), "prior_hashes_verified": len(prior["files"]),
                      "human_pairs": 0, "readiness": state["status"]}))


if __name__ == "__main__":
    main()
