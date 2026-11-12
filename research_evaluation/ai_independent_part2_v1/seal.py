"""Seal the review package and its input provenance without model inference."""
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
AI = Path(r"E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server")


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    counts = read(HERE / "audit_counts.json")
    for folder in ("reviewer_A", "reviewer_B"):
        with (HERE / "annotation" / folder / "HUMAN_ANNOTATION_TEMPLATE.csv").open(encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.DictReader(stream))
        assert len(rows) == len({r["item_id"] for r in rows}) == 226
        assert all(not r["annotator_id"] and not r["decision"] and not r["reviewed_utc"] for r in rows)
    a = (HERE / "annotation/reviewer_A/HUMAN_ANNOTATION_TEMPLATE.csv").read_bytes()
    b = (HERE / "annotation/reviewer_B/HUMAN_ANNOTATION_TEMPLATE.csv").read_bytes()
    assert a == b
    with (HERE / "RESERVED_133_IDS.csv").open(encoding="utf-8-sig", newline="") as stream:
        reserve = {r["item_id"] for r in csv.DictReader(stream)}
    v3 = read(ROOT / "research_evaluation/benchmark_200/versions/claude_adjudicated_v3/confirmatory_questions.json")
    exposure = read(ROOT / "research_evaluation/exploratory_frozen_v2/exposure_ledger.json")
    expected = {r["id"] for r in v3} - set(exposure["newly_exposed_ids"])
    assert reserve == expected and len(reserve) == 133
    assert counts["human_validated"] == 0
    assert read(HERE / "review-completeness.json")["completed_review_pairs"] == 0
    required = [
        "CYBERDAO_BENCHMARK_AUDIT.md", "HUMAN_ANNOTATION_TEMPLATE.csv", "HUMAN_ADJUDICATION_GUIDE.md",
        "AI_BASELINE_RESULTS.csv", "ABLATION_RESULTS.csv", "CLAIM_VERIFICATION_RESULTS.csv",
        "STATISTICAL_ANALYSIS.md", "FAILURE_ANALYSIS.md", "AI_SCIENTIFIC_EVALUATION_REPORT.md",
    ]
    assert all((HERE / name).exists() for name in required)
    for name, expected_rows in (("AI_BASELINE_RESULTS.csv", 4), ("ABLATION_RESULTS.csv", 0),
                                ("CLAIM_VERIFICATION_RESULTS.csv", 0), ("HUMAN_AGREEMENT_RESULTS.csv", 0)):
        with (HERE / name).open(encoding="utf-8-sig", newline="") as stream:
            assert len(list(csv.DictReader(stream))) == expected_rows
    inputs = [ROOT / "research_evaluation" / item for item in (
        "FINAL_PAPER_EVIDENCE.md", "benchmark_200/questions.json", "benchmark_200/questions_verified.json",
        "benchmark_200/ground_truth.json", "benchmark_200/quality.json", "benchmark_200/evidence/snapshot.json",
        "benchmark_200/review/independent_audit/independent_adjudication.json",
        "benchmark_200/versions/claude_adjudicated_v3/accepted_questions.json",
        "benchmark_200/versions/claude_adjudicated_v3/accepted_gold.json",
        "benchmark_200/versions/claude_adjudicated_v3/confirmatory_questions.json",
        "benchmark_200/versions/claude_adjudicated_v3/confirmatory_gold.json",
        "benchmark_200/versions/claude_adjudicated_v3/readiness_counts.json",
        "benchmark_200/versions/claude_adjudicated_v3/revisions_pending.json",
        "benchmark_200/versions/claude_adjudicated_v3/exposed_exclusions.json",
        "exploratory_frozen_v1/responses.jsonl", "exploratory_frozen_v2/responses.jsonl",
        "exploratory_frozen_v2/exposure_ledger.json", "exploratory_frozen_v2/summary.json",
        "harness_validation_v1/smoke_metrics.csv", "harness_validation_v1/responses.jsonl",
        "harness_validation_v1/config.json", "harness_validation_v1/run_smoke.py",
        "harness_validation_v1/READINESS_DECISION.json", "harness_validation_v1/BENCHMARK_READINESS.md",
        "harness_validation_v1/EXPLORATORY_PROTOCOL_AFTER_CANDIDATE.json",
        "harness_validation_v1/single_agent_candidate_v3.py",
        "failure_diagnosis/FAILURE_ANALYSIS.md", "failure_diagnosis/budget_claim_errors.json",
        "failure_diagnosis/excluded_attempt_taxonomy.json", "failure_diagnosis/full_workflow_taxonomy.json",
    )]
    for p in inputs:
        if not p.is_file():
            raise ValueError(f"Missing provenance input: {p.name}")
    originals = [p for p in inputs if p.relative_to(ROOT).as_posix().startswith("research_evaluation/benchmark_200/")]
    unchanged = []
    for p in originals:
        relative = p.relative_to(ROOT).as_posix()
        blob = subprocess.check_output(["git", "show", "HEAD:" + relative], cwd=ROOT)
        if p.read_bytes().replace(b"\r\n", b"\n") != blob.replace(b"\r\n", b"\n"):
            raise ValueError(f"Historical benchmark differs from HEAD: {relative}")
        unchanged.append(relative)
    manifest_path = HERE / "AI_REPRODUCIBILITY_MANIFEST.json"
    package = [p for p in HERE.rglob("*") if p.is_file() and p != manifest_path and "__pycache__" not in p.parts]
    ai_files = [p for base in ("app/business/agents", "app/business/governance", "app/business/rag",
                               "app/business/mcp", "benchmark") for p in (AI / base).rglob("*.py")]
    ai_files += [AI / "requirements.txt", AI / "tests/test_benchmark_harness.py",
                 AI / "benchmark/m7/development.json", AI / "benchmark/m7/development-results.json"]
    hashes = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(set(inputs + package))}
    hashes.update({"ai/" + p.relative_to(AI).as_posix(): sha(p) for p in sorted(set(ai_files))})
    source = {}
    for label, repo in (("dao", ROOT), ("ai", AI)):
        source[label] = {
            "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
            "working_tree_porcelain": subprocess.check_output(["git", "status", "--porcelain=v1"], cwd=repo, text=True),
            "meaning": "Base commit plus hashes identify the current uncommitted source; no new commit created",
        }
    inventory = read(HERE / "model_inventory.json")
    info = {
        "generated_utc": datetime.now(timezone.utc).isoformat(), "schema_version": 1,
        "classification": "Independent-review preparation and historical descriptive audit",
        "readiness": "NO-GO confirmatory; missing independent human adjudication and evidence freeze",
        "source": source, "counts": counts, "new_model_runs": 0,
        "new_human_scored_outputs": 0, "human_agreement": None, "production_mutations": 0,
        "model_inventory_observed_utc": inventory["observed_utc"],
        "ollama_version": inventory.get("version"),
        "models": [{"name": m["name"], "digest": m["digest"], "size": m.get("details", {}).get("parameter_size")}
                   for m in inventory.get("tags", {}).get("models", [])],
        "model_settings": "Historical configurations retain their recorded settings. New settings in PROPOSED_CONDITIONS.json are unexecuted proposals.",
        "runtime": {"python": platform.python_version(),
                    "node": subprocess.check_output(["node", "--version"], text=True).strip()},
        "hardware": {"cpu": "hardware-cpu.json", "gpu": "hardware-gpu.json"},
        "software_validation": {"benchmark_harness_passed": 27, "review_agreement_helper_passed": 4,
                                "model_metadata_calls": ["GET /api/tags", "GET /api/version"]},
        "annotation_template_rows_per_reviewer": 226,
        "claims_awaiting_independent_annotation": True,
        "historical_benchmark_unchanged_from_HEAD_normalized": unchanged,
        "commands": [
            "python research_evaluation/ai_independent_part2_v1/prepare.py",
            "<AI virtualenv python> -m unittest discover -s tests -p test_benchmark_harness.py",
            "python -m unittest discover -s research_evaluation/ai_independent_part2_v1 -p test_assess_reviews.py",
            "python research_evaluation/ai_independent_part2_v1/assess_reviews.py <reviewer_A template> <reviewer_B template>",
            "python -m py_compile research_evaluation/ai_independent_part2_v1/prepare.py research_evaluation/ai_independent_part2_v1/assess_reviews.py",
            "python research_evaluation/ai_independent_part2_v1/seal.py",
        ],
        "files": hashes,
    }
    with manifest_path.open("x", encoding="utf-8") as stream:
        json.dump(info, stream, indent=2)
        stream.write("\n")
    for name, expected_sha in info["files"].items():
        p = AI / name[3:] if name.startswith("ai/") else ROOT / name
        assert sha(p) == expected_sha
    print(json.dumps({"manifest_files": len(hashes), "historical_benchmark_files_unchanged": len(unchanged),
                      "templates": "226 per reviewer", "reserved": 133, "human_review_pairs": 0,
                      "new_model_runs": 0}))


if __name__ == "__main__":
    main()
