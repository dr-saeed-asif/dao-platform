# Human adjudication guide

Two domain experts should work independently in reviewer_A and reviewer_B. Each must identify their own reviewer ID, record review time, and attest independent first-pass review. Keep one file private from the other expert until both are submitted. The current templates are blank. They contain no human judgments.

## Scope of review

The package contains 226 review records comprising the original 200 questions and 26 existing replacement candidates from the prior LLM audit. These are a review pool. Inclusion in a template does not admit an item to the benchmark. All original IDs are retained. RESERVED_133_IDS.csv identifies the current unexposed candidate reserve. The item registry retains exposure and prior LLM decisions for the coordinator. Reviewers should not use those decisions as their first-pass judgment.

First-pass templates intentionally omit the proposed gold. Read the referenced evidence, author an expected answer and scoring rule, then assess validity and answerability. The coordinator can supply annotation/proposed_gold_reference.json afterward for comparison with the prior AI-assisted proposal. Log every change with a reason. Showing a proposed answer can anchor a reviewer, so record when it was shown. The shared original snapshot and its hash are referenced in each row. An annotation package can reveal private governance evidence and requires authorized distribution.

For source scopes pilot, training, cleanup and testing, consult the matching database and blockchain objects in benchmark_200/evidence/snapshot.json. PDF pages are under documents.pilot.pages and documents.training.pages. The snapshot is dated in audit_counts.json. Answer a question against its specified evidence and time. Current production state is not a substitute for that snapshot. The two PDFs explicitly contain synthetic demonstration data and must be described accordingly.

## Required fields

- question_validity must be valid, invalid or uncertain.
- answerability must be answerable, bounded_unanswerable, unauthorized or ambiguous.
- ambiguity must be none, material or uncertain.
- decision must be accept, revise, reject or pending.
- confidence must be low, medium or high.
- independent_review_attestation must be yes only after genuine independent review.
- expected_answer_authored_by_reviewer, supporting_evidence_spans and evaluation_criteria must be completed before accepting an item. For a denial, specify identity, permission and request context. For an abstention, specify the evidence boundary and prohibited inference.
- required_facts must include the entities, fields, values, currencies, units and source scope that an accurate answer must retain. Record optional wording separately. forbidden_inferences must cover unsupported causal, completeness and cross-scope conclusions.

Distinguish machine source checking, a separate LLM's assessment and independent human adjudication in all records. No automated script establishes a reviewer's independence or expertise.

## Scoring rubric for generated answers

Score each question-condition-repeat output as whole-answer correct, incorrect, abstained, execution_failed or harness_invalid. Correct requires every required fact with correct scope, relationships and uncertainty, and no material false claim. A bounded-unanswerable question is correct only for justified bounded abstention. Authorized but ambiguous wording must not be silently rewritten after outputs are viewed. Denial questions require actual authorization-path testing; a model's refusal alone does not demonstrate security enforcement.

Inventory every factual claim, including numerical and completeness statements. Label each supported, contradicted, unsupported or ambiguous, with cited source spans. Check relation between field, value, currency and unit. Citation syntax/existence and actual support receive separate columns. Record source evidence and model/fallback attribution. A cited wrong value remains incorrect.

The two claim templates are schemas awaiting real claim instances. They contain zero annotated claims. Populate them from blinded evaluation responses and a separately sourced claim evaluation set. Include supported, contradicted, unsupported, ambiguous, swapped-field, wrong-unit/currency and completeness examples. Keep synthetic M7 development cases outside the independent evaluation set.

## Agreement and resolution

Freeze each submission before revealing the other. Compare question validity, answerability, ambiguity and decision using raw percent agreement and Cohen's kappa on matched complete IDs. Report denominators, category distributions and missing reviews. Kappa is undefined if expected agreement is one. Do not report zero agreement merely because no reviews exist.

A third expert resolves disagreements using the frozen source evidence. Log both initial decisions, cited evidence, adjudicator identity, final decision and resolution reason. Preserve revised text/answer versions and their parent IDs. A revision requires another independent decision. Do not overwrite the original dataset.

A final cohort needs both reviews, explicit disagreement resolution, a source/evidence freeze, a leakage check and an exposure check. The unauthorized cohort currently has no items accepted by the LLM review. Human review must establish its request and permission contexts rather than inheriting obsolete HTTP expectations. Exclude previously exposed questions from confirmatory inference through the recorded ledger. Any difficult or unavailable item stays in the audit denominator with a reason.

## Execution prerequisites

Return completed reviewer files and the adjudication log before any claim of independently validated confirmatory evaluation. Freeze the approved cohort, gold, source snapshot, prompts and configuration. Keep gold, scoring rubrics, reviewer notes and audit decisions out of model inputs. A model sees the user question, legitimate caller context and authorized retrieval/tool evidence only.
