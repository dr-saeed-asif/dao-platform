# Annotation import report

The existing reviewer files were examined at:

- research_evaluation/ai_independent_part2_v1/annotation/reviewer_A/HUMAN_ANNOTATION_TEMPLATE.csv
- research_evaluation/ai_independent_part2_v1/annotation/reviewer_B/HUMAN_ANNOTATION_TEMPLATE.csv

Each has 226 unique matching IDs and all required columns. Both are blank for human judgments. They are separate files whose first-pass contents match. Reviewers can edit independently, with the coordinator controlling access and later disclosure. A file check does not establish that real experts have worked independently.

Every item includes its original question and scope, source references and snapshot SHA-256, an expected_answer_authored_by_reviewer field, supporting-evidence and rubric fields, and a decision field. The expected-answer cells are deliberately blank for independent authoring. The old proposed gold is preserved in the separate 226-record proposed_gold_reference.json. Missing gold or rubric fields prevent a completed acceptance.

## Denominators

| Record population | Count | Meaning |
|---|---:|---|
| Original questions | 200 | Historical benchmark IDs retained |
| Prior replacement candidates | 26 | Existing alternatives from the saved audit |
| Combined human review pool | 226 | Includes exposed, rejected and unresolved items |
| Reserved unexposed candidates | 133 | Subset available for prospective content screening |
| Complete reviewer A items | 0 | Actual imported blank-template result |
| Complete reviewer B items | 0 | Actual imported blank-template result |
| Complete paired human judgments | 0 | No agreement estimate available |
| Current approved confirmatory items | 0 | Human and freeze gates unmet |

There is no assumption that 133 and 226 are interchangeable denominators. A human-reviewed subset can be accepted only after all 133 candidate dispositions are explicit. Rejected candidates retain their reasons. Exposed items outside the reserve cannot be silently admitted.

## Import implementation

review_import.py validates IDs, immutable question/scope/evidence fields, categorical values, timezone-aware timestamps, authored gold, spans, scoring rules, required facts and prohibited inferences. It detects duplicate IDs and multiple identities within one submission and rejects the same identity supplying both reviews. It retains raw copied submissions, source hashes, per-item tracking, disagreements and a resolution template in a new immutable output directory.

The first-party guide and the reviewer files were preserved. blank-preflight-01 and blank-preflight-02 contain explicit preparation imports. The latter is the current preflight. Both record zero completed human pairs. No HUMAN_AGREEMENT_REPORT.md was generated. The importer computes paired nominal agreement only for complete rows and reports missingness separately. Publication of a human-agreement report additionally requires supplied coordinator verification bound to both input hashes. This verification is a human trust assertion. The script cannot authenticate expertise or independence.

Disagreements include categorical ratings and answer/rubric text differences. Text differences are prompts for review rather than automatic semantic contradictions. A third expert supplies a final decision, answer, rubric, evidence and reason, with validity, answerability and ambiguity checks. Reviewers cannot adjudicate their own pair. Adjudication provenance must be attested and bound to its CSV hash.

## Executed checks

The final importer/readiness regression suite passed 12 synthetic software tests. It covered blank inputs, duplicate IDs, changed evidence or question, absent gold, invalid timestamps, identical reviewer identities, answer/rubric differences, invalid resolution IDs, third-expert resolution, self-adjudication rejection and unbound attestations. The blank import remained NO-GO. These fixtures are software tests and add zero human judgments.

The readiness command was run with draft freeze/release templates and actual adapter diagnostics. It exited 2 with approved=false. No production database, model or blockchain request was executed in this task.

Commands are documented in README.md. Actual results are in imports/blank-preflight-02/import.json, adjudication_tracking.csv, disagreements.csv and readiness-final.json. No genuine completed annotation files have been imported.
