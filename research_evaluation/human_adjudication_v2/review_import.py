"""Validate and import independent question reviews without automatic approval."""
import argparse
from collections import Counter
import csv
from datetime import datetime
import hashlib
import json
from pathlib import Path
import shutil
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PARENT = HERE.parent / "ai_independent_part2_v1"
sys.path.insert(0, str(PARENT))
from assess_reviews import agreement, ALLOWED

IMMUTABLE = ("item_id", "category", "question", "dao_id", "proposal_id", "scope_label", "evidence_references")
DETAILS = ("expected_answer_authored_by_reviewer", "supporting_evidence_spans",
           "evaluation_criteria", "required_facts", "forbidden_inferences")
CORE = ("annotator_id", "reviewed_utc", "independent_review_attestation",
        "question_validity", "answerability", "ambiguity", "decision", "confidence")
REVIEW_FIELDS = CORE + DETAILS + ("notes",)
RESOLUTION_FIELDS = ("item_id", "adjudicator_id", "resolved_utc", "final_decision",
                     "final_expected_answer", "final_evaluation_criteria", "final_evidence_spans",
                     "final_question_validity", "final_answerability", "final_ambiguity",
                     "final_required_facts", "final_forbidden_inferences", "resolution_reason")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError("Metadata JSON must be an object")
    return value


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        rows = list(reader)
        headers = reader.fieldnames or []
    if any(None in row for row in rows):
        raise ValueError("CSV row has extra values")
    ids = [row.get("item_id", "").strip() for row in rows]
    if any(not key for key in ids) or len(ids) != len(set(ids)):
        raise ValueError("Missing or duplicate item IDs")
    return {row["item_id"]: row for row in rows}, headers


def utc_value(raw):
    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return False
    return value.tzinfo is not None and value.utcoffset() is not None


def normalize(raw):
    return " ".join(raw.split())


def validate_review(path, reference):
    rows, headers = read_csv(path)
    required = set(IMMUTABLE + REVIEW_FIELDS)
    if not required <= set(headers):
        raise ValueError("Annotation file is missing required columns")
    if set(rows) - set(reference):
        raise ValueError("Annotation file has unknown item IDs")
    complete, pending = {}, {}
    checked_evidence = {}
    identities = set()
    for item_id, row in rows.items():
        if any(row.get(key) != reference[item_id][key] for key in IMMUTABLE):
            raise ValueError(f"Question/evidence input changed for {item_id}; version a revision separately")
        references = json.loads(row["evidence_references"])
        if not isinstance(references, list) or not references:
            raise ValueError(f"Missing evidence provenance for {item_id}")
        for evidence in references:
            if not isinstance(evidence, dict) or not evidence.get("file"):
                raise ValueError(f"Invalid evidence reference for {item_id}")
            evidence_path = ROOT / evidence["file"]
            if evidence_path not in checked_evidence:
                if not evidence_path.is_file():
                    raise ValueError(f"Referenced evidence unavailable for {item_id}")
                checked_evidence[evidence_path] = sha(evidence_path)
            if checked_evidence[evidence_path] != evidence.get("sha256"):
                raise ValueError(f"Referenced evidence changed for {item_id}")
        if not any(row.get(key, "").strip() for key in REVIEW_FIELDS):
            pending[item_id] = "blank"
            continue
        for name, options in ALLOWED.items():
            if row.get(name) and row[name] not in options:
                raise ValueError(f"Invalid {name} for {item_id}")
        if row.get("confidence") not in ("", "low", "medium", "high"):
            raise ValueError(f"Invalid confidence for {item_id}")
        if row.get("reviewed_utc") and not utc_value(row["reviewed_utc"]):
            raise ValueError(f"Invalid timezone-aware review time for {item_id}")
        if row.get("annotator_id"):
            identities.add(row["annotator_id"])
        missing = [key for key in CORE + DETAILS if not row.get(key, "").strip()]
        if row.get("independent_review_attestation") != "yes":
            missing.append("independence_attestation")
        if row.get("decision") == "pending":
            missing.append("final_review_decision")
        if row.get("decision") in ("reject", "revise") and not row.get("notes", "").strip():
            missing.append("decision_reason")
        if row.get("decision") == "accept" and (
                row.get("question_validity") != "valid" or row.get("ambiguity") != "none"
                or row.get("answerability") == "ambiguous"):
            missing.append("unambiguous_valid_acceptance")
        if missing:
            pending[item_id] = "incomplete: " + ", ".join(sorted(set(missing)))
        else:
            complete[item_id] = row
    if len(identities) > 1:
        raise ValueError("One reviewer identity is required per submission")
    return {"rows": rows, "complete": complete, "pending": pending,
            "missing_ids": sorted(set(reference) - set(rows)), "identity": next(iter(identities), None),
            "sha256": sha(path)}


def validate_resolutions(path, disagreements, a, b):
    if path is None:
        return {}, []
    rows, headers = read_csv(path)
    if not set(RESOLUTION_FIELDS) <= set(headers):
        raise ValueError("Adjudication columns are missing")
    final, pending = {}, []
    for item_id, row in rows.items():
        if item_id not in disagreements:
            raise ValueError("Resolution item is not an identified completed-review disagreement")
        identities = {a["identity"], b["identity"]}
        filled = all(row.get(key, "").strip() for key in RESOLUTION_FIELDS)
        if (not filled or row["adjudicator_id"] in identities
                or row["final_decision"] not in {"accept", "reject", "revise"}
                or not utc_value(row["resolved_utc"])):
            pending.append(item_id)
            continue
        if row["final_decision"] == "accept" and (
                row["final_question_validity"] != "valid" or row["final_ambiguity"] != "none"
                or row["final_answerability"] not in ALLOWED["answerability"] - {"ambiguous"}):
            pending.append(item_id)
            continue
        final[item_id] = row
    return final, pending


def review_state(reference, candidates, a, b, resolutions_path=None, provenance=None):
    if a["identity"] and a["identity"] == b["identity"]:
        raise ValueError("Independent review requires distinct reviewer identities")
    paired = sorted(a["complete"].keys() & b["complete"].keys())
    dimensions = tuple(ALLOWED)
    agreements = {key: agreement([a["complete"][i][key] for i in paired],
                                  [b["complete"][i][key] for i in paired]) for key in dimensions} if paired else None
    disagreements = {}
    for item_id in paired:
        first, second = a["complete"][item_id], b["complete"][item_id]
        differences = [key for key in dimensions + DETAILS
                       if normalize(first[key]) != normalize(second[key])]
        if differences:
            disagreements[item_id] = differences
    resolved, invalid_resolutions = validate_resolutions(resolutions_path, disagreements, a, b)
    tracker, eligible, rejected = [], [], []
    for item_id in reference:
        state, final = "pending_both_reviews", None
        if item_id in paired:
            if item_id in disagreements and item_id not in resolved:
                state = "pending_adjudication"
            elif item_id in resolved:
                final = resolved[item_id]["final_decision"]
                state = "adjudicated_" + final
            else:
                final = a["complete"][item_id]["decision"]
                state = "reviewers_agree_" + final
            if final == "accept" and item_id in candidates:
                eligible.append(item_id)
            elif final == "reject" and item_id in candidates:
                rejected.append(item_id)
        elif item_id in a["complete"]:
            state = "pending_reviewer_B"
        elif item_id in b["complete"]:
            state = "pending_reviewer_A"
        tracker.append({"item_id": item_id, "in_reserved_133": item_id in candidates,
                        "reviewer_A_complete": item_id in a["complete"],
                        "reviewer_B_complete": item_id in b["complete"],
                        "state": state, "final_decision": final or "",
                        "semantic_disagreement_fields": json.dumps(disagreements.get(item_id, []))})
    verified = bool(provenance and provenance.get("independent_human_review_verified") is True
                    and provenance.get("coordinator_id") not in {a["identity"], b["identity"], None, ""}
                    and utc_value(provenance.get("verified_utc", ""))
                    and provenance.get("reviewer_A_id") == a["identity"] and a["identity"]
                    and provenance.get("reviewer_B_id") == b["identity"] and b["identity"]
                    and provenance.get("verification_method") and provenance.get("evidence_reference")
                    and provenance.get("reviewer_A_sha256") == a["sha256"]
                    and provenance.get("reviewer_B_sha256") == b["sha256"])
    if resolved and not (
            provenance and provenance.get("adjudication_provenance_verified") is True
            and resolutions_path and provenance.get("adjudications_sha256") == sha(resolutions_path)):
        verified = False
    blockers = []
    if not verified:
        blockers.append("Coordinator verification of independent human provenance is absent or unbound")
    unresolved_candidates = [row["item_id"] for row in tracker if row["in_reserved_133"] and
                             row["final_decision"] not in ("accept", "reject")]
    if unresolved_candidates:
        blockers.append(f"{len(unresolved_candidates)} reserved candidates lack a final reviewed disposition")
    if not eligible:
        blockers.append("No accepted reserved cohort")
    blockers.extend(["Approved evidence freeze pending", "Current baseline/ablation adapters require validation",
                     "Manual confirmatory release pending"])
    return {"paired_ids": paired, "agreement": agreements, "disagreements": disagreements,
            "resolved_ids": sorted(resolved), "invalid_or_incomplete_resolutions": invalid_resolutions,
            "independent_human_provenance_verified_by_supplied_coordinator": verified,
            "eligible_content_ids_pending_freeze": sorted(eligible), "rejected_reserved_ids": sorted(rejected),
            "unresolved_reserved_ids": unresolved_candidates, "tracker": tracker,
            "approved": False, "blockers": blockers}


def write_csv(path, fields, rows):
    with path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def import_reviews(a_path, b_path, output, resolutions=None, provenance_path=None):
    if output.exists():
        raise ValueError("Output exists; use a new immutable import version")
    reference, _ = read_csv(PARENT / "HUMAN_ANNOTATION_TEMPLATE.csv")
    reserved, _ = read_csv_reserved(PARENT / "RESERVED_133_IDS.csv")
    a, b = validate_review(a_path, reference), validate_review(b_path, reference)
    provenance = read_json(provenance_path) if provenance_path else None
    state = review_state(reference, reserved, a, b, resolutions, provenance)
    output.mkdir(parents=True)
    shutil.copyfile(a_path, output / "reviewer_A.csv")
    shutil.copyfile(b_path, output / "reviewer_B.csv")
    if resolutions:
        shutil.copyfile(resolutions, output / "submitted_adjudications.csv")
    if provenance_path:
        shutil.copyfile(provenance_path, output / "submitted_human_provenance.json")
    report = {key: value for key, value in state.items() if key != "tracker"}
    report.update({"reference_sha256": sha(PARENT / "HUMAN_ANNOTATION_TEMPLATE.csv"),
                   "reserved_ids_sha256": sha(PARENT / "RESERVED_133_IDS.csv"),
                   "reviewer_A_sha256": a["sha256"], "reviewer_B_sha256": b["sha256"],
                   "reviewer_A_complete": len(a["complete"]), "reviewer_B_complete": len(b["complete"]),
                   "review_pool": len(reference), "reserved_candidates": len(reserved),
                   "missing_A_ids": a["missing_ids"], "missing_B_ids": b["missing_ids"],
                   "review_completeness_is_not_identity_authentication": True})
    (output / "import.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    write_csv(output / "adjudication_tracking.csv", list(state["tracker"][0]), state["tracker"])
    write_csv(output / "disagreements.csv", ["item_id", "fields", "reviewer_A", "reviewer_B"],
              [{"item_id": i, "fields": json.dumps(fields),
                "reviewer_A": json.dumps({f: a["complete"][i][f] for f in fields}),
                "reviewer_B": json.dumps({f: b["complete"][i][f] for f in fields})}
               for i, fields in state["disagreements"].items()])
    write_csv(output / "ADJUDICATION_TEMPLATE.csv", RESOLUTION_FIELDS,
              [{"item_id": i, **{f: "" for f in RESOLUTION_FIELDS if f != "item_id"}}
               for i in state["disagreements"]])
    # Agreement is meaningful only for completed submissions whose human
    # provenance the coordinator has explicitly checked and bound to file hashes.
    if state["paired_ids"] and state["independent_human_provenance_verified_by_supplied_coordinator"]:
        text = "# Human agreement report\n\n"
        text += f"Complete paired items: {len(state['paired_ids'])}. Unresolved disagreements: {len(state['disagreements'])-len(state['resolved_ids'])}.\n\n"
        text += "Human provenance uses the supplied coordinator attestation bound to the submitted file hashes. The software does not authenticate identity.\n\n"
        text += json.dumps(state["agreement"], indent=2) + "\n"
        (output / "HUMAN_AGREEMENT_REPORT.md").write_text(text, encoding="utf-8")
    return report


def read_csv_reserved(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    ids = {row["item_id"] for row in rows}
    if len(ids) != len(rows):
        raise ValueError("Duplicate reserved IDs")
    return ids, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewer-a", type=Path, required=True)
    parser.add_argument("--reviewer-b", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--adjudications", type=Path)
    parser.add_argument("--human-provenance", type=Path)
    args = parser.parse_args()
    try:
        report = import_reviews(args.reviewer_a, args.reviewer_b, args.out,
                                args.adjudications, args.human_provenance)
    except (ValueError, OSError, KeyError) as exc:
        parser.error(str(exc))
    print(json.dumps({"review_pool": report["review_pool"], "reserved_candidates": report["reserved_candidates"],
                      "completed_review_pairs": len(report["paired_ids"]), "approved": report["approved"],
                      "blockers": report["blockers"]}))


if __name__ == "__main__":
    main()
