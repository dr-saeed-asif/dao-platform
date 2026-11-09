"""Recompute pilot tables from immutable run rows. Run with AI repo on PYTHONPATH."""
import csv
import json
import re
import statistics as stat
import sys
from collections import Counter, defaultdict
from pathlib import Path

from benchmark.stats import bootstrap_ci, paired_bootstrap_diff, wilson_interval
from app.business.agents.claims import verify_claims

ROOT = Path(__file__).resolve().parents[1]
REF = re.compile(r"\[((?:D|G|B)\d+)\]")
NOUNS = {"votes": r"votes?(?: records?)?", "members": r"members?", "proposals": r"proposals?"}


def gold_hit(case, answer):
    """Lexical gold check. This estimates answer coverage, not semantic correctness."""
    answer = REF.sub("", answer.casefold()).replace("*", "").replace("(s)", "s")
    if case["kind"] == "title":
        return case["gold"].casefold() in answer
    if case["kind"] == "budget":
        return bool(re.search(r"(?<!\d)" + case["gold"][:-3] + r"[,\s]?" + case["gold"][-3:] + r"(?!\d)", answer))
    number = case["gold"]
    noun = NOUNS[case["kind"]]
    return bool(re.search(rf"(?<!\d){number}\s+{noun}\b|\b{noun}\b[^.\d\n]{{0,35}}(?<!\d){number}(?!\d)", answer))


def dist(values):
    vals = [v for v in values if v is not None]
    return {"n": len(vals), "median": stat.median(vals) if vals else None,
            "mean": stat.mean(vals) if vals else None,
            "min": min(vals) if vals else None, "max": max(vals) if vals else None}


def main():
    dataset = {r["id"]: r for r in json.loads((ROOT / "datasets/pilot.json").read_text(encoding="utf8"))}
    label = sys.argv[1] if len(sys.argv) > 1 else "pilot-v1"
    rows = [json.loads(line) for line in (ROOT / "raw_results" / label / "runs.jsonl").read_text(encoding="utf8").splitlines() if line]
    by_mode = defaultdict(list)
    scores = []
    for row in rows:
        answer = row["answer"] or ""
        refs, allowed = set(REF.findall(answer)), {s["source_id"] for s in row["sources"]}
        claims = verify_claims(answer, row["sources"])
        checks = [s for s in row["spans"] if s.get("kind") == "citation_check"]
        result = {"case": row["case"], "mode": row["mode"], "repeat": row["repeat"],
                  "status": row["status"], "gold_hit": row["status"] == "completed" and gold_hit(dataset[row["case"]], answer),
                  "unique_refs": len(refs), "valid_refs": len(refs & allowed), "claim_flags": claims["counts"],
                  "wall_ms": row["wall_ms"], "planning_ms": row["planning_ms"],
                  "citation_worker_check_ms": sum(s.get("latency_ms") or 0 for s in checks) if checks else None,
                  "worker_checks": len(checks), "worker_rejections": sum(s.get("status") == "failed" for s in checks),
                  "warnings": len(row["warnings"]), **row["metrics"]}
        scores.append(result)
        by_mode[row["mode"]].append(result)
    summary = {}
    for mode, group in by_mode.items():
        first = [r for r in group if r["repeat"] == 1]
        by_case = defaultdict(list)
        for r in group:
            by_case[r["case"]].append(int(r["gold_hit"]))
        summary[mode] = {
            "attempts": len(group), "completed": sum(r["status"] == "completed" for r in group),
            "scorable_unique_questions": len(by_case), "first_pass_hits": sum(r["gold_hit"] for r in first),
            "first_pass_n": len(first), "gold_hits": sum(r["gold_hit"] for r in group),
            "first_pass_wilson95": wilson_interval(sum(r["gold_hit"] for r in first), len(first)),
            "question_cluster_bootstrap95_exploratory": bootstrap_ci([stat.mean(rs) for rs in by_case.values()]),
            "citing_answers": sum(r["unique_refs"] > 0 for r in group),
            "valid_refs": sum(r["valid_refs"] for r in group), "unique_refs": sum(r["unique_refs"] for r in group),
            "claim_flags": dict(sum((Counter(r["claim_flags"]) for r in group), Counter())),
            "warnings": sum(bool(r["warnings"]) for r in group),
            "worker_checks": sum(r["worker_checks"] for r in group),
            "worker_rejections": sum(r["worker_rejections"] for r in group),
            **{k: dist([r.get(k) for r in group]) for k in (
                "wall_ms", "planning_ms", "retrieval_ms", "llm_ms", "input_tokens", "output_tokens",
                "embedding_tokens", "citation_worker_check_ms")},
        }
    (ROOT / f"analysis/{label}-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf8")
    (ROOT / f"analysis/{label}-scores.jsonl").write_text(
        "".join(json.dumps(r) + "\n" for r in scores), encoding="utf8")
    full = {(r["case"], r["repeat"]): r for r in by_mode.get("full", [])}
    comparisons = {}
    for mode, group in by_mode.items():
        if mode == "full" or not full:
            continue
        pairs = [(full[key], row) for row in group if (key := (row["case"], row["repeat"])) in full]
        case_latency_diffs = defaultdict(list)
        for a, b in pairs:
            case_latency_diffs[a["case"]].append((a["wall_ms"] - b["wall_ms"]) / 1000)
        comparisons[mode] = {"pairs": len(pairs),
                             "full_only_gold_hit": sum(a["gold_hit"] and not b["gold_hit"] for a, b in pairs),
                             "baseline_only_gold_hit": sum(b["gold_hit"] and not a["gold_hit"] for a, b in pairs),
                             "paired_latency_seconds_full_minus_baseline": paired_bootstrap_diff(
                                 [stat.mean(vals) for vals in case_latency_diffs.values()],
                                 [0.0] * len(case_latency_diffs))}
    (ROOT / f"analysis/{label}-paired.json").write_text(json.dumps(comparisons, indent=2), encoding="utf8")
    with (ROOT / f"tables/{label}.csv").open("w", newline="", encoding="utf8") as file:
        writer = csv.writer(file)
        writer.writerow(["mode","attempts","completed","gold_hits","first_pass_hits","first_pass_n","wilson_low","wilson_high",
                         "citing_answers","valid_refs","unique_refs","median_wall_ms","median_retrieval_ms",
                         "median_workflow_input_tokens","median_workflow_output_tokens","worker_gate_checks","worker_gate_rejections"])
        for mode, s in summary.items():
            writer.writerow([mode, s["attempts"], s["completed"], s["gold_hits"], s["first_pass_hits"], s["first_pass_n"],
                            *(s["first_pass_wilson95"] or (None,None)), s["citing_answers"], s["valid_refs"], s["unique_refs"],
                            s["wall_ms"]["median"], s["retrieval_ms"]["median"], s["input_tokens"]["median"],
                            s["output_tokens"]["median"], s["worker_checks"], s["worker_rejections"]])
    print(f"Analyzed {len(rows)} observed runs")


if __name__ == "__main__":
    main()
