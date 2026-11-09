"""Validate saved observations and export summaries without executing application calls.

Run before seal.py. Requires only Python's standard library.
"""
import csv
import json
import math
import re
import statistics as st
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def rows(path):
    return [json.loads(s) for s in (ROOT / path).read_text(encoding="utf-8-sig").splitlines() if s]


def main():
    checked = 0
    gold = {c["id"]: c for c in load("datasets/pilot.json")}
    for label, expected_n in (("pilot-small", 32), ("pilot-v1", 1), ("direct-db", 12)):
        raw = rows(f"raw_results/{label}/runs.jsonl")
        scores = rows(f"analysis/{label}-scores.jsonl")
        summary = load(f"analysis/{label}-summary.json")
        assert len(raw) == len(scores) == expected_n
        key = lambda r: (r["mode"], r["case"], r["repeat"])
        assert len({key(r) for r in raw}) == expected_n
        index = {key(r): r for r in scores}
        table = {r["mode"]: r for r in csv.DictReader((ROOT / f"tables/{label}.csv").open(encoding="utf8"))}
        for r in raw:
            s = index[key(r)]
            assert r["status"] == s["status"] and r["wall_ms"] == s["wall_ms"]
            case = gold[r["case"]]
            answer = re.sub(r"\[((?:D|G|B)\d+)\]", "", r["answer"] or "").lower().replace("*", "").replace("(s)", "s")
            if case["kind"] == "title":
                hit = case["gold"].lower() in answer
            elif case["kind"] == "budget":
                hit = bool(re.search(r"(?<!\d)" + case["gold"][:-3] + r"[,\s]?" + case["gold"][-3:] + r"(?!\d)", answer))
            else:
                noun = {"votes": r"votes?(?: records?)?", "members": r"members?", "proposals": r"proposals?"}[case["kind"]]
                n = case["gold"]
                hit = bool(re.search(rf"(?<!\d){n}\s+{noun}\b|\b{noun}\b[^.\d\n]{{0,35}}(?<!\d){n}(?!\d)", answer))
            assert s["gold_hit"] == (r["status"] == "completed" and hit)
            refs = set(re.findall(r"\[((?:D|G|B)\d+)\]", r["answer"] or ""))
            assert len(refs) == s["unique_refs"]
            assert len(refs & {a["source_id"] for a in r["sources"]}) == s["valid_refs"]
            checked += 1
        for mode, aggregate in summary.items():
            group = [s for s in scores if s["mode"] == mode]
            assert aggregate["attempts"] == len(group) == int(table[mode]["attempts"])
            assert aggregate["gold_hits"] == sum(s["gold_hit"] for s in group) == int(table[mode]["gold_hits"])
            first = [s for s in group if s["repeat"] == 1]
            n = len(first)
            p = sum(s["gold_hit"] for s in first) / n
            z = 1.959963984540054
            center = (p + z*z/(2*n)) / (1+z*z/n)
            half = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / (1+z*z/n)
            assert all(math.isclose(a, b, abs_tol=2e-5) for a, b in zip(aggregate["first_pass_wilson95"], (center-half, center+half)))
            for name in ("wall_ms", "retrieval_ms", "input_tokens", "output_tokens", "citation_worker_check_ms", "planning_ms"):
                vals = [s[name] for s in group if s.get(name) is not None]
                assert aggregate[name]["n"] == len(vals)
                assert not vals or math.isclose(aggregate[name]["median"], st.median(vals), abs_tol=1e-9)
    challenge = load("raw_results/citation-challenge.json")
    structural = sum(c["expected_structural_valid"] == c["structural"]["valid"] for c in challenge["checks"])
    review = list(csv.DictReader((ROOT / "analysis/first-pass-claim-review.csv").open(encoding="utf8")))
    counts = Counter(r["status"] for r in review)
    assert counts == {"supported": 15, "contradicted": 1}
    db2 = next(r for r in rows("raw_results/pilot-small/runs.jsonl") if r["mode"] == "full" and r["case"] == "DB2" and r["repeat"] == 1)
    assert "No other information about votes" in db2["answer"]
    assert "stored_votes_by_option_index" in db2["sources"][0]["content"]
    citation = {"structural_cases": len(challenge["checks"]), "structural_labels_matched": structural,
                "reviewed_claims": len(review), "claim_status": dict(counts),
                "explicit_references": sum(r["explicit_reference"] == "true" for r in review),
                "review_scope": "Four first-repeat full answers; unblinded assistant source review; no independent annotation",
                "live_repair_rate": None, "live_repair_reason": "No full-condition worker rejection observed"}
    (ROOT / "analysis/citation-summary.json").write_text(json.dumps(citation, indent=2), encoding="utf8")
    stream = rows("raw_results/http-stream.jsonl")
    assert len(stream) == 3 and all(r["http_status"] == 200 and r["cleanup_status"] == 200 and r["status"] == "completed" for r in stream)
    timing = {}
    for field in ("headers_ms", "first_section_ms", "final_event_ms", "eof_ms"):
        vals = [r[field] for r in stream]
        timing[field] = {"n": len(vals), "median_ms": st.median(vals), "mean_ms": st.mean(vals),
                         "sample_sd_ms": st.stdev(vals), "min_ms": min(vals), "max_ms": max(vals)}
    (ROOT / "analysis/streaming-summary.json").write_text(json.dumps({"completed": 3, "attempts": 3,
        "scope": "One DB1 question repeated; operator-authenticated FastAPI only; no browser/Nest timing",
        "statistics": timing, "confidence_intervals": None, "reason": "Sparse repeated trials on one question"}, indent=2), encoding="utf8")
    with (ROOT / "tables/streaming.csv").open("w", newline="", encoding="utf8") as f:
        writer = csv.writer(f)
        writer.writerow(["milestone", "n", "median_ms", "mean_ms", "sample_sd_ms", "min_ms", "max_ms"])
        for k, v in timing.items():
            writer.writerow([k, *v.values()])
    tex = [r"\begin{tabular}{lrrrr}", r"\hline", r"Variant & Runs & Gold hits & Valid IDs & Median s \\", r"\hline"]
    small = load("analysis/pilot-small-summary.json")
    for mode in ("full", "worker_gate_off", "single_evidence_worker", "llm_only"):
        s = small[mode]
        refs = f'{s["valid_refs"]}/{s["unique_refs"]}' if s["unique_refs"] else "--"
        tex.append(f'{mode.replace("_", " ")} & {s["attempts"]} & {s["gold_hits"]}/{s["attempts"]} & {refs} & {s["wall_ms"]["median"]/1000:.3f} ' + r"\\")
    tex += [r"\hline", r"\end{tabular}", "% Lexical requested-fact coverage, not whole-answer semantic accuracy.",
            "% Four purposive questions, two repeats each; qwen3:0.6b. Citation IDs do not establish support."]
    (ROOT / "tables/pilot-small.tex").write_text("\n".join(tex) + "\n", encoding="utf8")
    (ROOT / "audit/artifact-validation.json").write_text(json.dumps({"validated_run_rows": checked,
        "checks": ["Unique run identifiers", "Raw versus derived status and latency", "Citation IDs against returned sources",
                   "Summary medians against score rows", "CSV totals against summaries", "Contradiction linked to original answer/source",
                   "SSE HTTP, completion and cleanup status"],
        "scope_limit": "Artifact consistency verification; does not independently validate all semantic annotations or scorer accuracy"}, indent=2), encoding="utf8")
    print(f"Validated {checked} saved run rows; exported citation, streaming and LaTeX summaries.")


if __name__ == "__main__":
    main()
