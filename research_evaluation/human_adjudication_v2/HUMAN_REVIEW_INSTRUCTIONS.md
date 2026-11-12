# Human review instructions

The existing files are in ai_independent_part2_v1/annotation/reviewer_A/HUMAN_ANNOTATION_TEMPLATE.csv and reviewer_B/HUMAN_ANNOTATION_TEMPLATE.csv. They contain 226 matching item IDs, questions, evidence references, expected-answer authoring fields and decision fields. Each is a separate file. The proposed AI-assisted answers are in annotation/proposed_gold_reference.json and should be disclosed only after a first-pass independent submission is sealed.

Give each expert access only to their own working CSV and the authorized common evidence. Exchange neither ratings nor suggested answers before submission. Copy completed files to separate input paths and retain each version. File separation supports independent work, while actual independence, domain expertise and review history require coordinator verification. Software cannot establish these facts from an annotator name or a checkbox.

The 226 rows comprise the original 200 questions and 26 already-existing replacement candidates. Some were rejected, exposed or awaiting revision. Template inclusion is not benchmark acceptance. The 133 reserved candidates are a subset identified by RESERVED_133_IDS.csv and the exposure ledger. They are potential content for later screening. All 133 need an explicit final disposition before the prepared readiness gate can pass. Human rejections remain in the screened denominator. Exposed items and the other review-pool items cannot enter this cohort through automatic acceptance.

## First-pass annotation

Preserve item_id, category, question, DAO/proposal scope and evidence_references exactly. Record proposed changes in notes. A revised question requires a separately versioned item and renewed review, with the old ID retained in provenance.

The expected_answer_authored_by_reviewer cell is intentionally blank. Each expert should author it from the cited snapshot and source spans before seeing the prior AI gold. The field exists for every item. The separate reference JSON preserves the old proposed answer. Missing expected-answer content prevents completed acceptance.

Fill annotator_id consistently, reviewed_utc with a timezone, independent_review_attestation as yes only if true, validity as valid/invalid/uncertain, ambiguity as none/material/uncertain, answerability as answerable/bounded_unanswerable/unauthorized/ambiguous, decision as accept/revise/reject/pending and confidence as low/medium/high. Required details are the authored answer, supporting spans, evaluation criteria, required facts and forbidden inferences. Rejection or revision also needs notes. Use a documented not-applicable explanation where an answer cannot be supplied. Empty details remain incomplete.

Answer against the referenced frozen evidence and time. Current production state cannot silently replace the archived snapshot. PDF page text, SQL values and captured chain observations have separate provenance. Denials require a specified identity, resource and permission context. An HTTP code observed for one request does not validate an entire authorization category.

## Answer and claim labels

| Label | Required judgment |
|---|---|
| Supported | Cited evidence establishes the complete material claim, including entity, field, value, unit, currency, time and scope |
| Contradicted | The relevant evidence explicitly establishes an incompatible fact |
| Unsupported | The available evidence does not establish the asserted fact and does not directly refute it |
| Ambiguous | Wording, conflicting evidence or incomplete associations prevent a reliable support decision |

Apply these labels to atomic factual claims. Whole-answer correctness requires every required fact and no material incorrect assertion. A mixed answer should preserve individual claim labels and a separate whole-answer score. A numerical match somewhere in evidence is insufficient.

For example, a claim assigning the equipment amount to travel is contradicted when the source explicitly assigns travel a different amount. If the source never identifies travel, the claim is unsupported. Conflicting travel rows may be ambiguous. These are rubric examples, not new benchmark records. Zero votes and a false tie value are known values and must not be called missing.

Completeness claims require an explicit bounded population and adequate evidence of coverage. A few retrieved pages cannot establish that no additional expenses or proposals exist. A justified bounded abstention can be correct for an unanswerable question. Absence of a relevant retrieved passage does not by itself support a global absence claim.

## Submission and adjudication

Run review_import.py with two submitted CSV paths and a fresh output directory. It rejects unknown/duplicate IDs, altered question/evidence inputs, invalid labels and invalid times. Blank or incomplete submissions remain pending. It binds supplied coordinator verification to both CSV hashes. Agreement uses only complete matched rows, with paired denominators and missingness.

The disagreement report includes decision/validity/answerability/ambiguity differences and differences in authored answers and rubrics. Text differences are review prompts and are not automatically semantic errors. A third expert resolves each material difference. Retain both initial ratings, the final decision, answer, required facts, prohibited inferences, evidence, resolution reason, adjudicator identity and time. The adjudicator must differ from the original reviewers.

Final acceptances must be valid and unambiguous. Revisions stay pending until separately reviewed. The import never approves a confirmatory run. Human provenance and adjudication attestation are external coordinator responsibilities. The readiness checker also requires a complete evidence freeze, validated adapters and a manual release bound to the submitted artifact hashes.

The claim-review CSVs in the prior package are empty schemas. They still require actual claims and independently authored labels. No human agreement report is created for blank templates or unverified provenance.
