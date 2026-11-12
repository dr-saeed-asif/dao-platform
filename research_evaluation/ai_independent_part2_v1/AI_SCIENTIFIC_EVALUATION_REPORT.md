# Independent AI evaluation readiness report

The requested independent confirmatory study is blocked by missing human adjudication and an approved evidence freeze. Completed work comprises a source/exposure audit, a 226-record review package for two independent experts, a claim-review schema, explicit separation of historical and newly requested baseline definitions, a prospective paired scoring/statistical plan, an available-model inventory and regression validation of the existing benchmark infrastructure.

| Readiness measure | Observed count |
|---|---:|
| Original questions | 200 |
| Review pool including prior replacements | 226 |
| Remaining reserved candidate questions | 133 |
| Completed independent human reviews | 0 |
| Human-adjudicated questions | 0 |
| Independently annotated evaluation claims | 0 |
| New baseline/ablation model attempts | 0 |
| Benchmark-harness regression tests passed | 27 |

The reserved category counts are DB 26, PDF 35, multi-source 27, complex 28 and bounded unknown 17, with zero accepted authorization items. Source diversity is four proposal scopes and two small synthetic demonstration PDFs. Revisions and missing categories stay visible rather than being replaced to raise expected scores.

## Historical resource table

The following measurements are the archived qwen3:4b-instruct two-development-question smoke. B2 was a tool-using single agent, whereas the new requested B2 is plain RAG. Whole-answer correctness was not independently human scored.

| Historical condition | Attempts | Reported completed | Fallbacks | Median wall seconds | Input/output tokens summed |
|---|---:|---:|---:|---:|---:|
| B1 | 2 | 2 | 0 | 9.507 | 366 / 204 |
| B2 | 2 | 1 | 0 | 74.650 | 22,867 / 942 |
| B3 | 2 | 2 | 0 | 50.084 | 5,448 / 846 |
| B4 | 2 | 2 | 1 | 75.064 | 5,448 / 868 |

These rows are copied with source references into AI_BASELINE_RESULTS.csv. The separate B2 retest is not pooled into them. Earlier frozen comparison ratings and M7 development cases remain in their original reports. No current confirmatory accuracy follows from this table.

## Pending result tables

| Requested result | Actual status |
|---|---|
| New B1 LLM / B2 plain RAG / B3 tools / B4 full comparison | Unexecuted, human gold and current adapters pending |
| A1 extractor-disabled / A2 gate-disabled / A3 full / A4 SQL comparison | Unexecuted, research adapters require implementation and parity validation |
| Independently annotated M7 precision/recall and support table | No independently annotated claims available |
| Human agreement table | No completed paired reviews available |
| Current failure-category rates and computational overhead | No new campaign records |
| Statistical effects and confidence intervals | No eligible paired independent-scoring observations |

Header-only CSVs represent pending experiments and contain no synthetic zero scores. A3 and B4 describe the same full configuration and should reuse the same observation when equivalent rather than doubling the denominator.

## Methods ready for human review

Two experts first author answers and rubrics independently from the frozen source references, then compare the AI-assisted proposed gold after sealing their first-pass submissions. A third expert resolves disagreement with retained evidence and a versioned log. The coordinator verifies expertise and independence and freezes the accepted cohort, source evidence, gold, prompts, permissions and decoding before inference.

The proposed primary model is the locally inventoried qwen3:4b-instruct. An 8B model is available for a separate model-size condition if resources permit. Availability was checked by metadata calls only. The proposed common decoding uses temperature zero, seeds 42/43/44, context 8192 and output cap 1536. These settings remain proposed until the human-reviewed protocol is frozen. Fixed seeds are recorded as controls and do not create independent samples.

Run keys must preserve question, condition and repeat with exact model/evidence hashes. Record actual retrieved evidence, citations, gate decisions, per-segment producer attribution, tokens or null, latency and every failed attempt. Gold and reviewer notes must stay outside prompts. Comparable tool-equipped variants require the same wallet/DAO/proposal permissions, authorized source snapshot and errors. Architecture-specific prompts are recorded and cannot be described as identical.

## Manuscript implications

M1-M3 claims about overall accuracy, multi-agent superiority, extractor benefit and gate benefit remain pending. M7's synthetic regression improvement remains development evidence. The manuscript can state the audited benchmark sizes, review preparation, observed historical failures and resource measurements with explicit version and provenance. It cannot claim independent human validation, a completed 200-question confirmatory study, an empirically superior full architecture or a measured ablation effect.

The key blockers are two completed independent reviews with adjudication, independent claim labels, approved evidence/gold freeze and validated adapters for the new baseline/ablation definitions. The package preserves all original IDs, raw results and the reserve. No production behavior was changed.


The newly prepared annotation-statistics helper passed four unit checks. These verify empty-input, undefined-kappa and paired-label calculations on synthetic software fixtures. They add zero human review observations. No production configuration, deployment, database or blockchain state was changed by this task.
