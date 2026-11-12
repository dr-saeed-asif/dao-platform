"""Compare completed human submissions, without manufacturing missing reviews."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path

DIMENSIONS = ("question_validity", "answerability", "ambiguity", "decision")
ALLOWED = {
    "question_validity": {"valid", "invalid", "uncertain"},
    "answerability": {"answerable", "bounded_unanswerable", "unauthorized", "ambiguous"},
    "ambiguity": {"none", "material", "uncertain"},
    "decision": {"accept", "revise", "reject", "pending"},
}


def load(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    result = {r["item_id"]: r for r in rows}
    if len(result) != len(rows):
        raise ValueError("Duplicate reviewer item IDs")
    return result


def agreement(first, second):
    if not first or len(first) != len(second):
        raise ValueError("Agreement requires a nonempty paired set")
    n = len(first)
    observed = sum(a == b for a,b in zip(first,second)) / n
    ca, cb = Counter(first), Counter(second)
    expected = sum(ca[k] * cb[k] for k in ca.keys() | cb.keys()) / (n*n)
    return {"paired_items": n, "percent_agreement": observed,
            "cohens_kappa": (observed-expected)/(1-expected) if expected < 1 else None,
            "expected_agreement": expected}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reviewer_a", type=Path)
    parser.add_argument("reviewer_b", type=Path)
    args = parser.parse_args()
    a, b = load(args.reviewer_a), load(args.reviewer_b)
    if a.keys() != b.keys():
        parser.error("Reviewer IDs differ")
    for data in (a, b):
        for key, row in data.items():
            for dimension, values in ALLOWED.items():
                if row.get(dimension) and row[dimension] not in values:
                    parser.error(f"Unsupported {dimension} in item {key}")
    for key in a:
        if any(a[key].get(field) != b[key].get(field) for field in ("question", "evidence_references")):
            parser.error("Reviewer question/evidence inputs differ; reconcile versions before agreement")
    reviewed = [key for key in a if all(
        row.get("independent_review_attestation") == "yes"
        and row.get("annotator_id") and row.get("reviewed_utc")
        and all(row.get(d) for d in DIMENSIONS)
        for row in (a[key], b[key]))]
    if not reviewed:
        print(json.dumps({"status": "pending", "matched_template_items": len(a),
                          "completed_review_pairs": 0, "agreement": None,
                          "reason": "No completed independent human review pairs supplied"}))
        return
    if any(a[key]["annotator_id"] == b[key]["annotator_id"] for key in reviewed):
        parser.error("Two distinct reviewer identities are required")
    print(json.dumps({
        "status": "provided_reviews_require_coordinator_provenance_and_resolution",
        "matched_template_items": len(a), "completed_review_pairs": len(reviewed),
        "incomplete_pairs": len(a)-len(reviewed),
        "agreement": {d: agreement([a[k][d] for k in reviewed], [b[k][d] for k in reviewed])
                      for d in DIMENSIONS},
        "disagreement_ids": [k for k in reviewed if any(a[k][d] != b[k][d] for d in DIMENSIONS)],
        "limitation": "Attestation is recorded input. This script does not authenticate human independence or adjudicate gold answers.",
    }, indent=2))


if __name__ == "__main__":
    main()
