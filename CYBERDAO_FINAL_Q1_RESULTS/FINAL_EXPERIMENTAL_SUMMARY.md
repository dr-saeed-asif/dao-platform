# Final exploratory experimental summary
**COMPLETE: data collection, offline analysis and artifact sealing. Human-adjudicated confirmatory evaluation remains unperformed.**

## Execution integrity
All1,862 expected keys are present, parseable and unique:133 questions × two model regimes × seven conditions. All14 cells contain133 records. Missing/duplicate/unexpected keys:0. The original1,239 records and the later1,262-record audit retain exact byte prefixes; all44 failures from that audit are preserved. Total failures:84/1,862; subsequent failures after that audit:40. Original38-failure stage plus46 later failures is a separate accounting boundary, not another cohort. No completed observation was restarted or replaced. Inference ended at 2026-11-12T16:06:34.609318+00:00; executed application source hashes remained unchanged.

## Baselines
B1:LLM without evidence. B2:plain frozen-document RAG. B3:single agent with22 permitted tools. B4:full AI graph/gates, trusted in-process operator context and archived chain-report replay. These are frozen research variants with all chat stages normalized to the chosen model and decoding settings, not default production configuration or a live C4/C7 security test.

| Model | Condition | Proxy matches /133 | Failures /133 | Warnings | Median / p95 wall (s) |
|---|---|---:|---:|---:|---:|
| qwen3:0.6b | B1 | 13/133 | 0/133 | 0 | 0.985 / 1.521 |
| qwen3:0.6b | B2 | 39/133 | 0/133 | 0 | 2.170 / 2.988 |
| qwen3:0.6b | B3 | 8/133 | 0/133 | 0 | 1.258 / 6.284 |
| qwen3:0.6b | B4 | 23/133 | 0/133 | 92 | 4.883 / 10.295 |
| qwen3:4b-instruct | B1 | 17/133 | 0/133 | 0 | 11.623 / 27.310 |
| qwen3:4b-instruct | B2 | 47/133 | 26/133 | 0 | 39.862 / 100.358 |
| qwen3:4b-instruct | B3 | 18/133 | 26/133 | 0 | 73.444 / 200.016 |
| qwen3:4b-instruct | B4 | 64/133 | 8/133 | 73 | 89.024 / 200.002 |

## Ablations
A1 disables direct-answer helpers; A2 disables M7 blocking only, retaining structural citation/legacy currency checks; A12 disables both. No tuning used these campaign outcomes.

| Model | Condition | Proxy matches /133 | Failures /133 | Warnings | Median / p95 wall (s) |
|---|---|---:|---:|---:|---:|
| qwen3:0.6b | A1 | 13/133 | 0/133 | 98 | 4.813 / 10.554 |
| qwen3:0.6b | A12 | 14/133 | 0/133 | 85 | 4.530 / 8.979 |
| qwen3:0.6b | A2 | 25/133 | 0/133 | 81 | 5.933 / 10.853 |
| qwen3:0.6b | B4 | 23/133 | 0/133 | 92 | 4.883 / 10.295 |
| qwen3:4b-instruct | A1 | 56/133 | 8/133 | 74 | 95.076 / 200.003 |
| qwen3:4b-instruct | A12 | 84/133 | 7/133 | 41 | 100.144 / 199.196 |
| qwen3:4b-instruct | A2 | 76/133 | 9/133 | 43 | 88.628 / 200.003 |
| qwen3:4b-instruct | B4 | 64/133 | 8/133 | 73 | 89.024 / 200.002 |

## Full versus Plain RAG on identical questions
| Model | Paired questions | Full minus Plain RAG proxy (pp) | Four-scope bootstrap95% interval (pp) |
|---|---:|---:|---|
| qwen3:0.6b | 133 | -12.03 | [-16.81, +28.57] |
| qwen3:4b-instruct | 133 | +12.78 | [+4.74, +42.86] |

The earlier assertion that Full trails Plain RAG applies to the0.6B proxy results, not both regimes. At4B, Full has64/133 matches versus47/133 for RAG. This is not independently validated answer accuracy. Intervals resample four proposal scopes,2,000 draws,seed110911. With only four dependent scopes, shared facts and provisional reference labels, these are unstable conditional descriptive intervals; even an interval above zero does not establish general superiority or human-validated correctness. No significance test is claimed.

## Citation, claim and abstention diagnostics
| Model | Condition | Automatically flagged / parsed factual claims | Structurally valid answers /133 | Abstention cues /133 |
|---|---|---:|---:|---:|
| qwen3:0.6b | B2 | 101/120 | 0/133 | 67/133 |
| qwen3:0.6b | B4 | 48/329 | 133/133 | 39/133 |
| qwen3:4b-instruct | B2 | 214/218 | 2/133 | 62/133 |
| qwen3:4b-instruct | B4 | 181/598 | 125/133 | 46/133 |

The gate's flags include citation-policy violations and unsupported/unchecked parsing outcomes; they do not measure a true factual-error rate. Parsed claim units are not independently human-segmented claims. Independently validated unsupported-claim rates and whole-answer accuracy are unavailable. Structural validity checks references/form, not entailment; all cited answers passed structurally, but RAG often lacks canonical citations. Lexical abstention cues can appear inside otherwise substantive answers and are not validated abstention decisions. SUPPORT_CITATION_ABSTENTION.csv reports rates and denominators, including unchecked claims and bounded-unknown versus reference-answerable cue strata. No unauthorized-disclosure rate is estimable:there are no authorization questions in this133-item cohort.

## Failures, invalid attempts and latency
Outer failure classes:{'ReadTimeout': 43, 'TimeoutError': 37, 'No final answer': 4}. All failures remain in proxy and latency denominators. Zero current model/options/key-validation failures were found;307 stored-payload digest differences follow privacy redaction and are distinguished from configuration mismatches. Historical harness-invalid and title-contaminated attempts belong to separate preserved development campaigns (HISTORICAL_EXCLUSION_ACCOUNTING.json), not exclusions from the1,862 records.

Latency includes failures; p95 is nearest-rank. B2 generation timing excludes cached retrieval/setup. Observed deadline overruns were retained; async200-second configuration is not an absolute measured wall-time bound. HTTP deadlines differ by stage (TRANSPORT_TIMEOUT_CLARIFICATION.json), despite normalized decoding and shared outer budgets. Resource residency, queueing, sequential phases and model-template/weight differences limit causal latency or scaling conclusions. Token totals include observed provider reports; missing reports are unknown, not zero cost.

## Existing diagnostic interpretation; no benchmark tuning
Prior development/diagnostic records show unrequested planner task expansion/substitution, budget-line ordinals interpreted as amounts, bounded fallback output and rejection of correct derived totals absent literally from evidence. These demonstrate mechanisms, not the prevalence or cause of every benchmark miss. The reference proxy can reward wrong field/value associations and miss valid paraphrases. RAG's selected numeric-claim review found2 contradicted atoms among4 purposively selected atoms; it was AI-assisted and not representative human adjudication. See raw/current_workflow_diagnostic.json, raw/arithmetic_guard_replay.json and raw/diagnostic_claim_review.json. No additional reserved-answer inspection, gate changes, prompt changes or gold changes were used for this closeout.

## Human review and remaining limits
Independent human labels/adjudication remain absent. Two reviewers must independently validate source-grounded answers and claim support, document disagreements and adjudication, and freeze criteria/evidence before human-scored findings can be reported. The226-item annotation pool differs from this133-question cohort. All133 questions are now exploratory-exposed; retrospective human review does not restore prospective hold-out status. Few PDFs/four scopes, near-duplicate/shared facts, four tool-projection alignment issues, one fixed seed, archived chain evidence and stage-specific runtime budgets limit generalization. No new research campaign was started.

## Artifacts and reproducibility
FINAL_EXPLORATORY_RESULTS.csv; FINAL_ABLATION_RESULTS.csv; SUPPORT_CITATION_ABSTENTION.csv; FAILED_RUNS.csv; FAILURE_ANALYSIS.md; STATISTICAL_ANALYSIS.md; paired_descriptive_comparisons.json; figures/exploratory_baselines.(svg,pdf,png); raw_archive_index.json; FINAL_REPRODUCIBILITY_MANIFEST.json. The3 raw archives passed byte-identical gzip round trips; originals remain present. The final manifest identifies source base commits plus executed-source hashes. Earlier partial-status manifests remain historical, not seals of the current tree. Reanalysis uses saved raw records; inference reproduction additionally requires authorized original SQL/index state and frozen model files. No production data, deployed contracts or credentials were changed.
