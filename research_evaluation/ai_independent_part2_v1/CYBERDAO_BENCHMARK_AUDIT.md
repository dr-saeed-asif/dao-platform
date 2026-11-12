# CyberDAO benchmark audit

| Audit stage | Count |
|---|---:|
| Original benchmark | 200 |
| Original machine source checks | 175 |
| Original quarantined items | 25 |
| Claude LLM audit pool | 226 |
| LLM accept / revise / reject | 155 / 15 / 56 |
| Accepted items exposed before v3 | 14 |
| V3 candidate pool before later exposure | 141 |
| Later exposed questions | 8 |
| Remaining reserved candidates | 133 |
| Independently human-adjudicated questions found | 0 |
| Currently confirmatory-eligible questions | 0 |
| Human review template pool | 226 |
| New model inference attempts in this task | 0 |

The original category allocation is DB 40, PDF 40, multi-source 40, complex 30, unanswerable 25 and unauthorized 25. The reserved pool contains DB 26, PDF 35, multi-source 27, complex 28 and unanswerable 17. It contains zero accepted unauthorized questions. These are unresolved content candidates and must not be described as a validated 200-question benchmark.

## Sources, scope and provenance

The original source snapshot was captured at 2026-11-09T00:18:41.990047+00:00. Four proposal scopes contribute 91 pilot, 89 training, ten cleanup and ten testing questions. Two source PDFs contain three and two pages respectively. Both explicitly contain synthetic demonstration content. The database records are application records captured by earlier scripts. These different provenance classes must remain visible in the manuscript. Current governance state or recovery output cannot silently replace the archived question evidence.

Question IDs, gold and evidence references are preserved. The gold field once called a cross-query source check independent verification. The recorded human_review_status is not_reviewed for all 200 original items. An independent Claude assessment is an LLM review. No completed human annotation submission was found in the saved research artifacts. The prior human_assessment_template.csv is a preparation file.

## Leakage and exposure

The new mechanical check found no exact duplicate text or duplicate declared semantic-target group among the original 200. This does not establish semantic independence. Many questions share the same two documents and facts. Twenty-five unanswerable answers and twenty-five unauthorized answers repeat category-level expectations. Common zero/one answers have low discrimination.

DB-021 has a literal long gold answer in its question/caller scope. This was already discussed in the LLM audit. The item registry preserves its decision. Known exposed IDs are retained, and the later exposure ledger excludes DB-006, DB-016, MS-002, MS-026, PDF-006, PDF-026, UN-R001 and UN-R018 from the v3 reserve. The 133 reserved IDs are exported without making model calls. Unexposed wording is not proof that the model has never encountered the underlying source facts. Wider training-data contamination was not tested.

## Objective scoring blockers

Free-form risks, implications and conclusions need an explicit evidence-grounded rubric with required facts and prohibited inferences. A substring or single numeric hit cannot establish correctness. Bounded unknowns require an explicit corpus boundary and timestamp. The 25 original unauthorized items inherit an old HTTP 401 expectation from one probe rather than 25 independently verified access contexts. C4 changed identity assertions, so current authorization expectations require separate human and integration validation. No accepted UA cohort currently exists.

Twenty-one snapshot-dependent accepted items were source-rechecked in earlier work, but historical SQL-at-chain-block alignment remained unavailable. Fourteen rewritten items await adjudication. One revision was superseded. Existing replacements are included for review and have not been generated afresh.

## Current execution decision

NO-GO for independent confirmatory inference. The required prerequisites are two independent expert reviews, documented disagreement resolution, an exposure-clean cohort, scoped evidence freeze and validated baseline/ablation adapters for current code. The package contains separate reviewer_A and reviewer_B files. Initial judgments must be authored from evidence before the proposed AI-assisted gold is disclosed. No row is automatically admitted based on an old LLM ACCEPT label.

The current model inventory includes a 4B instruction model and an 8B model. Availability establishes neither fairness nor run readiness. The historical 4B smoke had matching effective decoding across conditions, while prompts, tool protocols, actual call counts and failure/fallback paths varied. The archived B2 means tool-using single agent. The newly requested B2 means plain RAG. They must be given separate experiment namespaces.

Exact source files and hashes are in AI_REPRODUCIBILITY_MANIFEST.json. The original datasets, previous responses and exposure ledgers were read without changing their content.
