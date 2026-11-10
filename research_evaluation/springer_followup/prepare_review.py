"""Reserve the unexposed v3 cohort for a later reviewed experiment."""
import csv
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
VERSION = ROOT / "benchmark_200/versions/claude_adjudicated_v3"


def main():
    questions = json.loads((VERSION / "confirmatory_questions.json").read_text(encoding="utf8"))
    assert len(questions) == 141
    assert all(not q["exposed_to_systems"] for q in questions)
    plan = {
        "status": "prepared; execution gated",
        "question_file": "../benchmark_200/versions/claude_adjudicated_v3/confirmatory_questions.json",
        "question_sha256": hashlib.sha256((VERSION / "confirmatory_questions.json").read_bytes()).hexdigest(),
        "eligible_candidate_count": 141,
        "new_model_runs": 0,
        "human_validated_items": 0,
        "baseline_definition_source": "../benchmark_200/scripts/run.py",
        "baseline_source_sha256": hashlib.sha256((ROOT / "benchmark_200/scripts/run.py").read_bytes()).hexdigest(),
        "B1": "One model without retrieval or tools",
        "B2": "One model with all 22 permitted tool definitions and DAO/proposal guard; maximum six model turns",
        "B3": "Full planner/workflow with reference, currency and numeric blocking gates disabled by process-local ablation",
        "B4": "Full workflow with production verification gates",
        "required_before_execution": [
            "Freeze SQL, document-index and pinned-chain evidence for every variant",
            "Review whole-answer and claim-support scoring independently and fix the scoring rubric before generation",
            "Check equivalent permitted record access and document successful and failed tool requests",
            "Record model digests, prompts/options and unequal stage/retry budgets without claiming exact inference-budget matching",
            "Use a new campaign with the corrected verifier hash; retain every completed or failed checkpoint",
        ],
        "whole_answer_rubric": {
            "correct": "All requested supported facts are correct, correctly scoped and complete; no material conflicting claim",
            "partial": "Some requested facts are correct, but a requested part is missing or uncertainty is inconsistent",
            "incorrect": "A material claim is false, requested source attribution is wrong, or the answer supplies unsupported facts",
            "unassessed": "Reviewer assessment missing",
        },
        "claim_support_rubric": ["supported", "contradicted", "unsupported", "unassessable"],
        "citation_metrics": ["identifier validity", "claim-to-source factual support", "factual claim citation coverage"],
        "abstention_metrics": ["appropriate abstention on evidence-bounded unknowns", "false abstention on known records"],
        "statistics": "Retain paired question IDs and proposal clusters; report descriptive counts and justified clustered uncertainty. Human semantic metrics stay unknown until annotated.",
    }
    (HERE / "evaluation_preparation.json").write_text(json.dumps(plan, indent=2), encoding="utf8")
    with (HERE / "human_assessment_template.csv").open("w", newline="", encoding="utf8") as file:
        writer = csv.writer(file)
        writer.writerow(["id", "category", "question", "scope", "reviewer_id", "reviewer_derived_answer",
                         "evidence_refs", "whole_answer_correctness", "claim_support", "citation_support",
                         "abstention_appropriateness", "notes"])
        for item in questions:
            writer.writerow([item["id"], item["category"], item["question"], item["scope_label"], *[""] * 8])
    print("Prepared 141 reserved cases and scoring rubric; no model requests.")


if __name__ == "__main__":
    main()
