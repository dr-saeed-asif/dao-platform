"""Summarize saved experiments and generate figures without making service calls."""
import csv
import hashlib
import json
import statistics
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
VERSION = ROOT / "benchmark_200/versions/claude_adjudicated_v3"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def distribution(values):
    return {"n": len(values), "min": min(values), "median": statistics.median(values),
            "max": max(values), "mean": statistics.mean(values)}


def main():
    version_manifest = read(VERSION / "provenance.json")
    assert all(sha(VERSION / name) == value for name, value in version_manifest["files"].items())
    for name in ("questions.json", "ground_truth.json", "evidence/snapshot.json",
                 "review/independent_audit/independent_adjudication.json"):
        assert sha(ROOT / "benchmark_200" / name) == version_manifest["outside_version_dependencies"][name]
    previous = read(ROOT / "benchmark_200/archive/provenance_before_continuation.json")
    frozen = {name: digest for name, digest in previous["files"].items()
              if name.startswith("raw_results/")}
    assert all(sha(ROOT / "benchmark_200" / name) == digest for name, digest in frozen.items())
    readiness = read(VERSION / "readiness_counts.json")
    confirmed = read(VERSION / "confirmatory_questions.json")
    exposed = read(VERSION / "exposed_exclusions.json")
    assert len(confirmed) == readiness["confirmatory_content_eligible_under_LLM_review_policy"] == 141
    assert not {q["id"] for q in confirmed} & {q["id"] for q in exposed}
    assert all(row["source_recheck_passed"] for row in read(VERSION / "evidence/snapshot_only_21_recheck.json"))
    rows = lines(HERE / "reconciliation.jsonl")
    config = read(HERE / "reconciliation_config.json")
    deployment = lines(HERE / "deployment_checks.jsonl")[-1]
    assert deployment["runtimeVerified"] and config["database_read_only"]
    assert len(rows) == config["cohort_size"] == len({r["proposal_id"] for r in rows})
    status = Counter(row["status"] for row in rows)
    fields = Counter(f["field"] for row in rows for f in row.get("scalar_findings", [])
                     if f["status"] == "mismatched")
    faults = read(HERE / "fault_injection.json")
    assert faults["compiled_sha256"] == config["compiled_sha256"]
    classifications = Counter()
    for result in faults["results"]:
        if result["class"] == "positive":
            classifications["TP" if result["matches"] else "FN"] += 1
        if result["class"] in ("negative", "semantic_control"):
            classifications["TN" if result["matches"] else "FP"] += 1
    citation = read(ROOT / "raw_results/citation-challenge.json")
    structural = sum(r["structural"]["valid"] == r["expected_structural_valid"] for r in citation["checks"])
    security = read(HERE / "security_probes.json")
    metrics = {
        "benchmark": readiness, "reconciliation_status": dict(status), "scalar_mismatch_fields": dict(fields),
        "reconciliation_wall_ms": distribution([r["wall_ms"] for r in rows]),
        "distinct_pinned_blocks": len({r.get("block") for r in rows if r.get("block")}),
        "http_200": sum(r.get("http") == 200 for r in rows),
        "rpc_error_reports": sum(bool(r.get("errors")) for r in rows),
        "fault_confusion_counts": {key: classifications[key] for key in ("TP", "FP", "FN", "TN")},
        "fault_wall_ms": distribution([r["latency_ms"] for r in faults["results"]]),
        "fault_cases": len(faults["results"]),
        "citation_structural_cases_matching_expected": structural,
        "citation_structural_cases": len(citation["checks"]),
        "isolated_expected_tool_denials": sum(r["expected_denial"] for r in security["results"]),
        "isolated_tool_attempts": len(security["results"]),
        "population_CIs": None,
        "CI_reason": "Deployment cohort census and purposive one-run fixtures. No sampled population or replicated fault distribution.",
    }
    (HERE / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    with (HERE / "reconciliation_table.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["status", "proposals", "cohort"])
        writer.writerows((key, status[key], len(rows)) for key in ("verified", "mismatched", "unverified", "unavailable"))
    subset = read(ROOT / "benchmark_200/metrics/subset_summary.json")
    with (HERE / "baseline_comparison_exploratory.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["variant", "attempts", "count_proxy_hits", "mixed_certainty_flags", "median_wall_ms"])
        writer.writerows((variant, r["attempts"], r["requested_count_proxy_hits"], r["mixed_certainty_flags"], r["median_wall_ms"])
                         for variant, r in subset.items())

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 9, "svg.fonttype": "none", "axes.spines.top": False, "axes.spines.right": False})
    fig, (a, b) = plt.subplots(1, 2, figsize=(7.5, 2.8), layout="constrained")
    labels = ["verified", "mismatched", "unverified"]
    colors = ["#326688", "#a34c37", "#b18d39"]
    for i, (key, color) in enumerate(zip(labels, colors)):
        a.barh(i, status[key], color=color)
        a.text(status[key] + .3, i, str(status[key]), va="center")
        timings = sorted(r["wall_ms"] / 1000 for r in rows if r["status"] == key)
        b.scatter(timings, [i + ((j % 5) - 2) * .04 for j in range(len(timings))], color=color, s=19)
    for axis in (a, b):
        axis.set_yticks(range(3), [x.capitalize() for x in labels])
        axis.invert_yaxis()
        axis.grid(axis="x", alpha=.18)
        axis.set_axisbelow(True)
    a.set(xlabel="Proposals", xlim=(0, max(status.values()) + 3), title="Verifier outcomes (n = 39)")
    b.set(xlabel="HTTP wall time (s)", title="Individual observations")
    fig.savefig(HERE / "reconciliation.svg", bbox_inches="tight")
    fig.savefig(HERE / "reconciliation.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Benchmark and preserved raw hashes verified. Saved metrics, tables and figure.")


if __name__ == "__main__":
    main()
