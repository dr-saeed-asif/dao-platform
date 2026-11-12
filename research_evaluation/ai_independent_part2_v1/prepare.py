"""Prepare an auditable review package without running benchmark inference."""
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RESEARCH = HERE.parent
BENCH = RESEARCH / "benchmark_200"
VERSION = BENCH / "versions" / "claude_adjudicated_v3"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def write_csv(path, fields, values):
    with path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(values)


def main():
    original = read(BENCH / "questions.json")
    gold = {item["id"]: item for item in read(BENCH / "ground_truth.json")}
    audited = read(BENCH / "review/independent_audit/independent_adjudication.json")
    accepted = read(VERSION / "accepted_questions.json")
    accepted_gold = {item["id"]: item for item in read(VERSION / "accepted_gold.json")}
    review_questions = {q["id"]: q for q in original}
    review_questions.update({q["id"]: q for q in accepted})
    v3 = read(VERSION / "confirmatory_questions.json")
    exposure = read(RESEARCH / "exploratory_frozen_v2/exposure_ledger.json")
    exposed = {q["id"] for q in accepted if q.get("exposed_to_systems")}
    exposed.update(exposure["newly_exposed_ids"])
    exposed.update(row["id"] for row in audited if row.get("exposed_to_systems"))
    candidates = {q["id"] for q in v3} - exposed
    assert len(original) == len(gold) == 200
    assert len({q["id"] for q in original}) == 200
    assert len(audited) == len({q["id"] for q in audited}) == 226
    assert len(v3) == 141 and len(candidates) == 133
    snapshot_path = BENCH / "evidence/snapshot.json"
    snapshot = read(snapshot_path)
    duplicate_questions = defaultdict(list)
    semantic_groups = defaultdict(list)
    possible_leaks = []
    annotations, gold_index, registry = [], [], []
    for row in audited:
        item_id = row["id"]
        question = review_questions.get(item_id, row)
        proposed = accepted_gold.get(item_id, gold.get(item_id, row))
        answer = proposed.get("expected_answer", row.get("expected_answer"))
        evidence = proposed.get("source_identifiers", row.get("evidence_refs", []))
        refs = row.get("evidence_refs", [])
        if item_id in {q["id"] for q in original}:
            original_q = next(q for q in original if q["id"] == item_id)
            text = original_q["question"]
            duplicate_questions[re.sub(r"\s+", " ", text.strip().casefold())].append(item_id)
            semantic_groups[json.dumps(gold[item_id].get("semantic_target"), sort_keys=True)].append(item_id)
            # Only literal long strings are flagged here. Numerical answers can be
            # guessed from defaults without constituting an explicit leakage match.
            visible = " ".join(str(original_q.get(k, "")) for k in ("question", "dao", "proposal"))
            if isinstance(answer, str) and len(answer.strip()) >= 6 and answer.casefold() in visible.casefold():
                possible_leaks.append({"id": item_id, "reason": "Long proposed answer occurs literally in question or caller scope"})
        scope = question.get("scope_label", "")
        provenance = [{"file": str(snapshot_path.relative_to(ROOT)).replace("\\", "/"),
                       "sha256": sha(snapshot_path), "scope": scope, "reviewer_refs": refs}]
        empty = {
            "item_id": item_id, "category": row.get("category", question.get("category", "")),
            "question": row.get("question", question.get("question", "")),
            "dao_id": question.get("dao", ""), "proposal_id": question.get("proposal", ""),
            "scope_label": scope, "evidence_references": json.dumps(provenance),
            "annotator_id": "", "reviewed_utc": "", "independent_review_attestation": "",
            "question_validity": "", "expected_answer_authored_by_reviewer": "",
            "supporting_evidence_spans": "", "ambiguity": "", "answerability": "",
            "evaluation_criteria": "", "required_facts": "", "forbidden_inferences": "",
            "decision": "", "confidence": "", "notes": "",
        }
        annotations.append(empty)
        gold_index.append({
            "item_id": item_id, "proposed_answer_ai_assisted": answer,
            "provenance": proposed, "llm_audit": row,
            "stage": "Reference material for second-stage review after independent first-pass judgment",
        })
        registry.append({
            "item_id": item_id, "original_200": item_id in gold,
            "review_decision_llm": row["decision"], "exposed_by_recorded_ledger": item_id in exposed,
            "reserved_candidate": item_id in candidates,
            "human_validated": False, "confirmatory_eligible": False,
        })
    fields = list(annotations[0])
    write_csv(HERE / "HUMAN_ANNOTATION_TEMPLATE.csv", fields, annotations)
    for name in ("reviewer_A", "reviewer_B"):
        folder = HERE / "annotation" / name
        folder.mkdir(parents=True)
        write_csv(folder / "HUMAN_ANNOTATION_TEMPLATE.csv", fields, annotations)
    dump(HERE / "annotation/proposed_gold_reference.json", gold_index)
    dump(HERE / "item_registry.json", registry)
    write_csv(HERE / "RESERVED_133_IDS.csv", ["item_id", "category"],
              [{"item_id": q["id"], "category": q["category"]} for q in v3 if q["id"] in candidates])
    claim_columns = ["claim_id", "question_id", "response_id", "claim_text", "citation_ids",
                     "evidence_snapshot_sha256", "evidence_reference", "field", "value", "currency", "unit",
                     "completeness_scope", "annotator_id", "reviewed_utc", "independent_review_attestation",
                     "gold_label", "supporting_evidence_span", "notes"]
    for name in ("reviewer_A", "reviewer_B"):
        write_csv(HERE / "annotation" / name / "CLAIM_ANNOTATION_TEMPLATE.csv", claim_columns, [])
    # Record past measurements in their historical architecture regime.
    with (RESEARCH / "harness_validation_v1/smoke_metrics.csv").open(encoding="utf-8-sig", newline="") as stream:
        historical = list(csv.DictReader(stream))
    historical_rows = []
    definitions = {
        "B1": "Historical LLM without retrieval",
        "B2": "Historical single agent with scoped tools",
        "B3": "Historical full orchestration with verification checks disabled",
        "B4": "Historical full workflow with checks",
    }
    for row in historical:
        historical_rows.append({
            "evidence_regime": "Archived 4B development smoke, no new runs",
            "condition_id": row["variant"], "definition": definitions[row["variant"]],
            "model": "qwen3:4b-instruct", "model_digest": "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0",
            "questions": 2, "attempts": row["attempts"], "reported_completed": row["reported_completed"],
            "failed_status": row["failed_status"], "fallback_answers": row["fallback_answers"],
            "median_wall_ms": row["median_wall_ms"], "input_tokens": row["input_tokens"],
            "output_tokens": row["output_tokens"], "human_correctness": "",
            "source": "research_evaluation/harness_validation_v1/smoke_metrics.csv",
        })
    write_csv(HERE / "AI_BASELINE_RESULTS.csv", list(historical_rows[0]), historical_rows)
    write_csv(HERE / "ABLATION_RESULTS.csv",
              ["run_key", "question_id", "condition", "extractor_enabled", "gate_enabled",
               "answer_origin", "answer", "human_correctness", "latency_ms", "input_tokens",
               "output_tokens", "execution_error", "evidence_snapshot_sha256"], [])
    write_csv(HERE / "CLAIM_VERIFICATION_RESULTS.csv",
              ["claim_id", "question_id", "response_id", "human_gold", "gate_prediction",
               "gate_reason", "citation_ids", "field", "value", "currency", "unit",
               "evidence_span", "abstention", "latency_ms"], [])
    write_csv(HERE / "HUMAN_AGREEMENT_RESULTS.csv",
              ["dimension", "paired_items", "percent_agreement", "cohens_kappa",
               "disagreements", "resolution_status"], [])
    categories = Counter(q["category"] for q in original)
    scope_counts = Counter(q["scope_label"] for q in original)
    issue_counts = Counter(str(issue) for row in audited for issue in row.get("issues", []))
    candidate_cats = Counter(q["category"] for q in v3 if q["id"] in candidates)
    ledger_counts = {
        "original_questions": len(original), "source_checked_original": 175, "quarantined_original": 25,
        "llm_audit_records": len(audited), "llm_decisions": dict(Counter(r["decision"] for r in audited)),
        "llm_accepted": len(accepted), "v3_candidates_before_later_exposure": len(v3),
        "additional_exposed": len(exposure["newly_exposed_ids"]),
        "reserved_unexposed_candidates": len(candidates), "human_validated": 0,
        "confirmatory_eligible": 0, "annotation_pool": len(annotations),
        "original_category_counts": dict(categories), "original_scope_counts": dict(scope_counts),
        "reserved_candidate_categories": dict(candidate_cats),
        "exact_duplicate_question_groups": [ids for ids in duplicate_questions.values() if len(ids) > 1],
        "duplicate_declared_target_groups": [ids for ids in semantic_groups.values() if len(ids) > 1],
        "literal_answer_leak_flags": possible_leaks,
        "original_documents": {k: {"filename": v["filename"], "sha256": v["sha256"], "pages": len(v["pages"])}
                               for k, v in snapshot["documents"].items()},
        "source_snapshot_captured_utc": snapshot["captured_utc"],
        "llm_audit_issue_counts": dict(issue_counts),
        "new_model_runs": 0, "new_independently_scored_answers": 0,
        "review_templates_completed": 0,
    }
    dump(HERE / "audit_counts.json", ledger_counts)
    status = {
        "created_utc": datetime.now(timezone.utc).isoformat(), "decision": "NO-GO confirmatory",
        "completed": ["Versioned source audit", "Exposure registry", "Two independent human annotation templates",
                      "Claim annotation schema", "Historical baseline extraction", "Prospective scoring plan"],
        "blocked": ["Two genuinely independent completed human reviews", "Resolved benchmark gold",
                    "Review-approved evidence freeze", "Validated implementations of new baseline and ablation definitions",
                    "Independent claim annotations"],
        "new_inference_attempts": 0, "human_judgments": 0,
        "result_csv_policy": "Baseline CSV contains labelled archived smoke measurements. Ablation, claim and agreement CSVs have headers only.",
    }
    dump(HERE / "execution_status.json", status)
    print(json.dumps({"review_pool": len(annotations), "reserved": len(candidates),
                      "human_validated": 0, "literal_leak_flags": len(possible_leaks),
                      "new_runs": 0}))


if __name__ == "__main__":
    main()
