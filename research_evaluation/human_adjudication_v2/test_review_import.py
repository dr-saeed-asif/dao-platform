"""Synthetic importer regressions. Fixtures are never human-review evidence."""
import csv
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from review_import import (PARENT, read_csv, validate_review, review_state,
                           validate_resolutions, RESOLUTION_FIELDS)
from confirmatory_readiness import check


class ReviewImporterTests(unittest.TestCase):
    def setUp(self):
        reference, _ = read_csv(PARENT / "HUMAN_ANNOTATION_TEMPLATE.csv")
        self.reference = {next(iter(reference)): next(iter(reference.values()))}
        self.item = next(iter(self.reference))
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.base = Path(self.folder.name)

    def file(self, name, rows):
        path = self.base / name
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(next(iter(self.reference.values()))))
            writer.writeheader()
            writer.writerows(rows)
        return path

    def completed(self, identity="fixture_A"):
        row = deepcopy(self.reference[self.item])
        row.update(annotator_id=identity, reviewed_utc="2026-11-11T12:00:00Z",
                   independent_review_attestation="yes", question_validity="valid",
                   answerability="answerable", ambiguity="none", decision="accept", confidence="high",
                   expected_answer_authored_by_reviewer="Synthetic fixture answer",
                   supporting_evidence_spans="Fixture, line 1", evaluation_criteria="Fixture exact facts",
                   required_facts="Fixture value", forbidden_inferences="None beyond fixture")
        return row

    def test_blank_is_pending_and_produces_no_agreement(self):
        a = validate_review(self.file("a.csv", list(self.reference.values())), self.reference)
        b = validate_review(self.file("b.csv", list(self.reference.values())), self.reference)
        state = review_state(self.reference, {self.item}, a, b)
        self.assertIsNone(state["agreement"])
        self.assertFalse(state["approved"])
        self.assertEqual(state["unresolved_reserved_ids"], [self.item])

    def test_rejects_duplicate_ids(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_review(self.file("a.csv", [self.completed(), self.completed()]), self.reference)

    def test_rejects_modified_evidence_and_question(self):
        for field in ("question", "evidence_references"):
            row = self.completed()
            row[field] = "tampered"
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "changed"):
                validate_review(self.file(field + ".csv", [row]), self.reference)

    def test_acceptance_without_gold_is_incomplete(self):
        row = self.completed()
        row["expected_answer_authored_by_reviewer"] = ""
        state = validate_review(self.file("a.csv", [row]), self.reference)
        self.assertFalse(state["complete"])
        self.assertIn(self.item, state["pending"])

    def test_rejects_naive_or_invalid_time(self):
        row = self.completed()
        row["reviewed_utc"] = "2026-11-11"
        with self.assertRaisesRegex(ValueError, "time"):
            validate_review(self.file("a.csv", [row]), self.reference)

    def test_same_identity_cannot_supply_two_independent_reviews(self):
        a = validate_review(self.file("a.csv", [self.completed()]), self.reference)
        with self.assertRaisesRegex(ValueError, "distinct"):
            review_state(self.reference, {self.item}, a, a)

    def test_rubric_difference_requires_adjudication(self):
        a = validate_review(self.file("a.csv", [self.completed()]), self.reference)
        second = self.completed("fixture_B")
        second["evaluation_criteria"] = "A different fixture rubric"
        b = validate_review(self.file("b.csv", [second]), self.reference)
        state = review_state(self.reference, {self.item}, a, b)
        self.assertEqual(state["tracker"][0]["state"], "pending_adjudication")
        self.assertFalse(state["eligible_content_ids_pending_freeze"])
        self.assertEqual(state["agreement"]["decision"]["cohens_kappa"], None)

    def test_unknown_resolution_rejected(self):
        p = self.base / "adjudication.csv"
        with p.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=RESOLUTION_FIELDS)
            writer.writeheader()
            writer.writerow(dict(item_id="unknown"))
        with self.assertRaisesRegex(ValueError, "not an identified"):
            validate_resolutions(p, {}, {}, {})

    def test_current_blank_import_remains_no_go(self):
        report = check(Path(__file__).parent / "imports/blank-preflight-01")
        self.assertFalse(report["approved"])
        self.assertEqual(report["status"], "NO-GO")
        self.assertGreaterEqual(len(report["blockers"]), 4)

    def resolution(self, identity="fixture_third"):
        path = self.base / "resolution.csv"
        row = {key: "Synthetic resolution" for key in RESOLUTION_FIELDS}
        row.update(item_id=self.item, adjudicator_id=identity, resolved_utc="2026-11-11T13:00:00Z",
                   final_decision="accept", final_question_validity="valid", final_ambiguity="none",
                   final_answerability="answerable")
        with path.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=RESOLUTION_FIELDS)
            writer.writeheader()
            writer.writerow(row)
        return path

    def divergent_pair(self):
        a = validate_review(self.file("a.csv", [self.completed()]), self.reference)
        row = self.completed("fixture_B")
        row["expected_answer_authored_by_reviewer"] = "Another synthetic answer"
        b = validate_review(self.file("b.csv", [row]), self.reference)
        return a, b

    def test_third_expert_resolution_tracks_content_but_does_not_approve(self):
        a, b = self.divergent_pair()
        state = review_state(self.reference, {self.item}, a, b, self.resolution())
        self.assertEqual(state["resolved_ids"], [self.item])
        self.assertEqual(state["eligible_content_ids_pending_freeze"], [self.item])
        self.assertFalse(state["approved"])
        self.assertFalse(state["independent_human_provenance_verified_by_supplied_coordinator"])

    def test_original_reviewer_cannot_adjudicate_own_disagreement(self):
        a, b = self.divergent_pair()
        state = review_state(self.reference, {self.item}, a, b, self.resolution("fixture_A"))
        self.assertEqual(state["invalid_or_incomplete_resolutions"], [self.item])
        self.assertEqual(state["tracker"][0]["state"], "pending_adjudication")

    def test_unbound_human_attestation_is_insufficient(self):
        a = validate_review(self.file("a.csv", [self.completed()]), self.reference)
        b = validate_review(self.file("b.csv", [self.completed("fixture_B")]), self.reference)
        state = review_state(self.reference, {self.item}, a, b,
                             provenance={"independent_human_review_verified": True})
        self.assertFalse(state["independent_human_provenance_verified_by_supplied_coordinator"])
        self.assertFalse(state["approved"])


if __name__ == "__main__":
    unittest.main()
