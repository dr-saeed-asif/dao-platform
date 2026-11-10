"""Compare saved pre/post observations and publish the affected-subset follow-up."""
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent


def read(path):
    return json.loads(path.read_text(encoding="utf8"))


def records(path):
    return [json.loads(line) for line in path.read_text(encoding="utf8").splitlines()]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    before = {r["proposal_id"]: r for r in records(ROOT / "springer/reconciliation.jsonl")}
    after = records(HERE / "reconciliation.jsonl")
    config = read(HERE / "reconciliation_config.json")
    runtime = records(HERE / "deployment_checks.jsonl")[-1]
    assert len(after) == 7 and len({r["proposal_id"] for r in after}) == 7
    assert {r["proposal_id"] for r in after} == {k for k, r in before.items() if r["status"] == "mismatched"}
    assert runtime["runtimeVerified"]
    assert digest(REPO / "apps/api/src/ai/blockchain-verification.service.ts") == config["source_sha256"]
    assert digest(REPO / "apps/api/dist/ai/blockchain-verification.service.js") == config["compiled_sha256"]
    fault = read(HERE / "fault_injection.json")
    assert fault["compiled_sha256"] == config["compiled_sha256"]
    assert len(fault["results"]) == 1 and fault["results"][0]["matches"]
    assignment = read(HERE / "assignment_independent.json")
    assert assignment["sql_active_rows"] == assignment["sql_distinct_members"] == 10
    assert assignment["contract_active_count"] == assignment["sql_members_confirmed_on_chain"] == 9
    assert assignment["sql_members_not_assigned_at_pin"] == 1
    assert "1 passed" in (HERE / "unit_finalized.txt").read_text(encoding="utf8")
    summary = Counter(r["status"] for r in after)
    assert summary == {"unverified": 6, "mismatched": 1}
    table = []
    for row in sorted(after, key=lambda r: int(r["on_chain_id"])):
        previous = before[row["proposal_id"]]
        status = next(f for f in row["scalar_findings"] if f["field"] == "voting_status")
        table.append({"on_chain_id": row["on_chain_id"], "before_status": previous["status"], "after_status": row["status"],
                      "after_voting_status_check": status["status"], "before_block": previous["block"], "after_block": row["block"],
                      "before_wall_ms": previous["wall_ms"], "after_wall_ms": row["wall_ms"]})
    with (HERE / "affected_comparison.csv").open("w", newline="", encoding="utf8") as file:
        writer = csv.DictWriter(file, fieldnames=list(table[0]))
        writer.writeheader()
        writer.writerows(table)
    metrics = {"affected_proposals_retested": 7, "post_status": dict(summary), "pre_status": {"mismatched": 7},
               "source_sha256": config["source_sha256"], "compiled_sha256": config["compiled_sha256"],
               "runtime_corrected_status_verified": runtime["runtimeVerified"], "new_regression_tests_passed": 1,
               "affected_false_positive_control": {"before": "mismatched", "after": "verified", "post_replicates": 1},
               "whole_39_cohort_repeated": False, "post_39_confusion_matrix": None,
               "population_confidence_intervals": None, "reason": "Purposive seven-case defect retest; different chain pins and observation times",
               "new_model_trials": 0, "reserved_unexposed_candidates": 141, "human_adjudicated_items": 0}
    (HERE / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf8")
    report = """# Reconciliation follow-up

The six status mismatches came from a missing database-status alias. The database uses `FINALIZED`, while the contract returns `Closed` and records finalization separately. The November 8 implementation included assignment and event changes but omitted this alias. The archived deployment loaded that implementation correctly. Its assignment-count marker alone could not establish that status normalization was complete.

The verified production fix adds `FINALIZED: 'Closed'`. The separate finalization, winning-option and tie checks continue to run. The new targeted regression test passed, with ten unrelated tests skipped by its filter. The previously false-positive finalization fixture returned `verified` in its one affected post-fix run. The fresh isolated endpoint returned a verified `Closed`/`Closed` comparison for a finalized proposal. Source digest, compiled digest and the working-tree patch identify this uncommitted revision.

| Affected subset | Mismatched | Unverified | Verified |
|---|---:|---:|---:|
| Archived pre-fix observations | 7 | 0 | 0 |
| Post-fix retest of those seven | 1 | 6 | 0 |

The six corrected status cases remain unverified because SQL winning-option and tie fields are missing. The remaining mismatch is the assignment count. Seven post-fix observations have separate raw records. The other 32 proposals were not rerun, and no fresh 39-proposal post-fix result is claimed. Observation times and chain blocks differ between runs, so latency changes do not isolate the effect of the code patch.

The assignment investigator independently queried SQL and used direct contract `getProposal` and `isAssigned` calls at the archived block, checking the network and canonical block hash before and after. SQL contained 10 active rows for 10 distinct members. The contract counter was 9 and only 9 of those SQL-listed members were assigned at that block. This independently confirms the observed cross-store disagreement and rules out duplicate SQL rows as the count explanation. Historical SQL state, indexer freshness and the origin of the extra active row remain unknown. The evidence does not establish a blockchain fault. No governance data was repaired to change a research outcome.

The earlier six classifiable fault cases contained one false positive. Only that affected control was rerun, and it now passed. The other five observations retain their original code version and measurement times. The earlier chain-only-event fixtures also showed an aggregate event-count mismatch while their individual rows were unverified. This follows the aggregate count comparison and remains a limitation of checkpoint-aware interpretation. A checkpoint-specific diagnosis is still unavailable. Those completeness cases were outside the original six-case confusion matrix.

The 141 unexposed, LLM-reviewed candidates remain reserved. Human-adjudicated whole-answer and claim-support results are unavailable. `evaluation_preparation.json` specifies the existing B1–B4 definitions, scoring rubric and outstanding evidence-freeze gates. `human_assessment_template.csv` contains 141 blank reviewer records. No model trial was repeated or newly generated during this follow-up.

The one-line source fix and its regression are the only production-tree changes. Original measurements remain archived. Raw records, code patch, before/after table, figure and provenance are in this directory.
"""
    (HERE / "FOLLOWUP_RESULTS.md").write_text(report, encoding="utf8")
    original_report = (HERE / "SPRINGER_BEFORE_FOLLOWUP.md").read_text(encoding="utf8")
    update = """# Updated reconciliation findings

The targeted follow-up fixed the missing `FINALIZED` status alias and verified the deployed correction. Rechecking the seven originally mismatched proposals produced **one mismatch and six unverified results**. The six status comparisons now pass, but missing SQL winner/tie data prevents full verification. An independent contract membership check confirmed 10 distinct active SQL members versus a contract count of 9, including one SQL-listed member unassigned at the archived block. Its cause and historical index state remain unresolved.

One new targeted unit regression and the one affected false-positive control passed. The original 39-proposal run and all other fault observations remain historical measurements. The affected subset uses new observation times and pinned blocks. Population accuracy or a fresh post-fix 39-proposal result cannot be inferred by pooling the records.

The [follow-up report](springer_followup/FOLLOWUP_RESULTS.md), [paired table](springer_followup/affected_comparison.csv), [figure](springer_followup/affected_comparison.svg) and [raw post-fix records](springer_followup/reconciliation.jsonl) provide the updated manuscript evidence. The 141 unexposed candidates remain reserved pending the declared scoring and evidence-freeze gates. Independent human-adjudicated correctness and claim-support results remain unavailable.

---

## Archived pre-fix study account

"""
    (ROOT / "SPRINGER_EXPERIMENTAL_RESULTS.md").write_text(update + original_report, encoding="utf8")
    mapping = (HERE / "EVIDENCE_TO_CLAIMS_BEFORE_FOLLOWUP.md").read_text(encoding="utf8")
    old_row = "| Verifier has reliable status normalization and checkpoint diagnosis | Unsupported by current results | The finalized-state fixture produced a false mismatch. Chain-only events remained unverified at row level and produced aggregate mismatches in the two index completeness fixtures. |"
    new_rows = "| FINALIZED status normalization | Verified in the affected follow-up | The targeted unit regression and finalization fixture passed. All six affected live status comparisons now pass. |\n| Checkpoint-aware interpretation | Pending | Chain-only event rows and aggregate counts retain different statuses. No checkpoint-specific diagnosis was established. |"
    assert old_row in mapping
    mapping = mapping.replace(old_row, new_rows)
    mapping += "\nThe original 39-case outcome row describes the archived pre-fix run. The targeted seven-case follow-up returned one mismatch and six unverified results. Direct contract membership reads support the observed assignment disagreement, while its cause and temporal SQL alignment remain unresolved. [Follow-up evidence](../springer_followup/FOLLOWUP_RESULTS.md)\n"
    (ROOT / "springer/EVIDENCE_TO_CLAIMS.md").write_text(mapping, encoding="utf8")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 9, "svg.fonttype": "none", "axes.spines.top": False, "axes.spines.right": False})
    fig, (a, b) = plt.subplots(1, 2, figsize=(7.4, 3.0), layout="constrained")
    a.bar([-.16, .84], [7, 1], width=.3, color="#a34c37", label="Mismatched")
    a.bar([.16, 1.16], [0, 6], width=.3, color="#b18d39", label="Unverified")
    a.set(xticks=[0, 1], xticklabels=["Pre-fix", "Post-fix"], yticks=range(0, 9, 2), ylim=(0, 9), ylabel="Affected proposals", title="Same seven proposal IDs")
    a.legend(frameon=False, fontsize=8)
    b.bar([0, 1], [10, 9], color=["#396a93", "#728c67"])
    for x, y in enumerate([10, 9]):
        b.text(x, y + .2, str(y), ha="center")
    b.set(xticks=[0, 1], xticklabels=["Distinct active\nSQL members", "Contract\nassigned count"], ylim=(0, 12), ylabel="Members", title="Independent archived-block check")
    fig.suptitle("Targeted follow-up; SQL history and disagreement cause unresolved", fontsize=10)
    fig.savefig(HERE / "affected_comparison.svg", bbox_inches="tight")
    fig.savefig(HERE / "affected_comparison.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Validated seven post-fix observations, one fixture and one unit regression; updated reports and paired figure.")


if __name__ == "__main__":
    main()
