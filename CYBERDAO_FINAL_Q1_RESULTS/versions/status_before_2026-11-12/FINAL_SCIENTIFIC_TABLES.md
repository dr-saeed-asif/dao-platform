# Scientific tables
All new AI observations are exploratory. Gold is AI-assisted; reference matching is not semantic whole-answer accuracy. Failures stay in attempt denominators.

## Table 1. Baselines
| Model | Condition | Attempts / planned | Returned | Failed | Reference-match proxy | Citation-valid answers | Median wall (s) | Observed input/output tokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| qwen3:0.6b | B1 | 133/133 | 133 | 0 | 13/133 | 0/133 | 0.985 | 23976/6409 |
| qwen3:0.6b | B2 | 133/133 | 133 | 0 | 39/133 | 0/133 | 2.170 | 207890/8508 |
| qwen3:0.6b | B3 | 133/133 | 133 | 0 | 8/133 | 0/133 | 1.258 | 234100/10408 |
| qwen3:0.6b | B4 | 133/133 | 133 | 0 | 23/133 | 133/133 | 4.883 | 325817/25222 |
| qwen3:4b-instruct | B1 | 133/133 | 133 | 0 | 17/133 | 0/133 | 11.623 | 22912/9588 |
| qwen3:4b-instruct | B2 | 133/133 | 107 | 26 | 47/133 | 2/133 | 39.862 | 162737/12572 |
| qwen3:4b-instruct | B3 | 9/133 | 6 | 3 | 1/9 | 0/9 | 97.689 | 26811/1211 |

## Table 2. Ablations
8 actual development observations across B4/A1/A2/A12 are in ABLATION_EXPERIMENT_RESULTS.csv: two questions, 0.6B only. The live-phase ablation counts are reported below. A1 disables five direct-answer helpers and budget_answer; A2 disables workflow/synthesis M7 blocking_flags only; A12 combines them. Structural citation/currency checks remain active. Extraction helper hits are recorded directly. Output-origin labels are heuristics, not proof of claim-level generation ancestry; token observations are retained. Direct SQL is reported below; B2 is also the plain-retrieval condition and is not double-counted.

## Table 3. Claim challenge
| Metric | Count | Estimate | Conditional Wilson 95% interval |
|---|---:|---:|---|
| Semantic-support precision | 4/4 | 1.000 | [0.510, 1.000] |
| Semantic-support recall | 4/8 | 0.500 | [0.215, 0.785] |
| False-positive rate | 0/16 | 0.000 | [0.000, 0.194] |
| Abstention | 12/24 | 0.500 | [0.314, 0.686] |
| Classification coverage | 12/24 | 0.500 | [0.314, 0.686] |

24 unique provisional cases: 18 synthetic patterns and six archived-PDF challenges. Two source-page construction errors were corrected by two targeted checks; all original 24 outputs remain. Total actual gate attempts26; source-valid final panel24. No code or answer label changed. CH-010/011 are semantically true but deliberately lack valid attribution, so semantic-support recall includes their correct rejection as false negatives. Acceptance on validly cited supported cases is 4/6. This is not an independent held-out entailment evaluation.

## Table 4. Failures
failure_taxonomy.json reports overlapping counts: missing outputs, timeouts, transport errors, absent citations, reference mismatches, automatically flagged and unchecked claims. These are automatic diagnostics, not human error judgments.

## Table 5. Performance
Table 1 and per_question_automatic_metrics.csv contain actual wall time and observed tokens. Frozen B2 query embeddings are computed once and reused across models; recorded embedding time/setup is separate from generation wall. Concurrency two, GPU offload, caches and queueing constrain comparisons. Missing failed-call tokens are unobserved. API costs and energy were not metered.

## Table 6. Human annotation
Completed paired human reviews0. Agreement and confirmatory accuracy are not estimable.

## Historical results retained by version
| Experiment/version | Actual result | Evidence and boundary |
|---|---|---|
| Small-model pilot | Full 8/8, gate-off 8/8, forced-evidence 4/8, LLM-only 0/8 gold-fact matches | 32 runs: four questions, two repeats, four variants. Lexical metric, not answer accuracy. ../research_evaluation/raw_results/pilot-small/runs.jsonl |
| Historical claim review | 15/16 supported; 1/16 contradicted; 14/16 explicitly cited | Unblinded AI-assisted review of four first-repeat answers. ../research_evaluation/analysis/first-pass-claim-review.csv |
| Streaming | 3/3 completed; median first section 3.318 s, final event 3.430 s | One question repeated through FastAPI; not browser/Nest latency. ../research_evaluation/analysis/streaming-summary.json |
| Original reconciliation | 23 verified, 7 mismatched, 9 unverified /39 | Original verifier and varying pins. ../research_evaluation/springer/reconciliation.jsonl |
| Post-status-alias targeted subset | 0 verified, 1 mismatched, 6 unverified /7 | Six status comparisons agree; missing winner/tie fields remain. ../research_evaluation/springer_followup/reconciliation.jsonl |
| C7 original-DB fixed-pin follow-up | 0 verified, 1 mismatched, 38 unverified /39 | Scoped checkpoint version mismatch v1 versus 1; 6 status aliases match; extra SQL assignment remains. ../research_evaluation/experiment_1_m4/reconciliation_39_comparison.md |
| Prior isolated recovery | 39 recovered; 24 verified, 15 unverified; 51.110 s | 110 assignments, 30 votes. ../research_evaluation/recovery_m4/ |
| Completeness follow-up | 39/39 recovered and verified; zero mismatched/unverified/failed; 51.896 s | Fixed block 20325000, one RPC provider. ../research_evaluation/recovery_completeness/results-01/RECOVERY_COMPLETENESS_REPORT.md |
| M5 document controls | Invalid rejection 11/12 before, 12/12 after; valid 3/3 both | Final indexed-evidence gate; not initial staging admission. Synthetic anchors/embeddings, real isolated SQL/parser. ../research_evaluation/m5_m6_postfix/M5_M6_POST_FIX_REPORT.md |
| Stale active chunks | Physical cleanup 0/1 before, 1/1 after | Audit metadata retained; not backup erasure. Same M5 report |
| M6 fault classification | 15/16 expected classifications, before/after | Coherently stale view indistinguishable from clean input; no independent RPC. Same M5/M6 report |
| Original six fault controls | TP4, FP1, FN0, TN1 | Alias false positive; affected retest verified. Separate from M6. ../research_evaluation/springer/fault_injection.json |
| Historical authorization | HTTP negatives 6/6; wallet 5/5; DTO/auth 3/3; isolated tool denials 4/4 | Separate protocols, not one denominator. Malformed DTO 400 versus valid unauthorized DTO 401. ../research_evaluation/FINAL_PAPER_EVIDENCE.md |
| Earlier frozen AI comparison | B1 2/8; historical tool-B2 2/8; historical ablated-B3 0/8; B4 1/8 | AI-assisted whole-answer judgments; 18 harness-invalid originals retained. Definitions differ from current campaign. ../research_evaluation/exploratory_frozen_v2/summary.json |
| M7 development | Before TP3/FP9/FN0/TN5; after TP3/FP0/FN0/TN14, n=17 | Synthetic development labels, not independent evaluation. ../../api-ai-server1/api-ai-server/benchmark/m7/development-results.json |

## Restored database and live-phase update
Database access was restored. All public-table fingerprints, selected SQL records/chunks and model digests match the earlier capture; 195 AI module hashes remain unchanged. See live_campaign/evidence/phase_equivalence.json. Only the ten missing smoke keys were executed; earlier completed keys were reused. The live campaign has 674/1,330 saved model-workflow attempts; completion=False. B1 and frozen-corpus RAG retain their 532 completed attempts. No original result, gold answer or production source was changed. B4 denotes the current full AI graph and gates with frozen external chain-report replay and trusted in-process operator context. It is not a live end-to-end C4/C7/authentication test. The archived verifier source differs from current C7 source; current reconciliation findings remain separate (live_campaign/evidence/chain_replay_scope.json).

The new direct-SQL baseline executed 26/26 applicable DB questions with 26/26 exact scalar agreements, zero LLM calls. Its hand-coded field selector is an oracle-like lookup baseline, not general text-to-SQL reasoning or independent gold validation. Other categories are outside this baseline's applicability. Four proposal-type items (DB-008/018/028/038) expect a database field absent from registered AI tool projections and the archived chain reports. They remain in all 133-item exploratory denominators, with access-aware expected-behavior adjudication pending; gold was not changed. Thus the SQL oracle has a broader projection for these four items and is not an equivalent-tool baseline. See live_campaign/evidence/proposal_type_access_check.json.

Live SQL and fixed-corpus RAG use identical captured facts/chunks, but execution phases and retrieval implementations differ. Raw outputs support independent reanalysis; live inference reproduction additionally requires the original authorized PostgreSQL/index snapshot and configuration, which are not a self-contained public database image. Model aliases/templates/weight-blob identifiers are frozen in evidence/model_recreation_metadata.json. Effective model attribution uses normalized provider requests and provider responses; application model_used/trace labels can retain the originally requested default name under the research interceptor. These are model regimes, not an isolated parameter-count scaling experiment. Decoding/model versions match; hardware residency, cache state and queueing are not controlled enough for a causal latency-overhead claim. Operational completed/returned counts include bounded fallback text and do not establish task success; worker failures and warnings remain in raw records. Every case uses the declared model/call/deadline budgets. The legacy live-run started_utc field is assigned at completion; it is retained unchanged and labelled as a completion timestamp in derived metrics. Monotonic wall_ms remains the observed duration. Full baselines and ablations are real model executions, not copied predictions.

## Live-phase ablation table
| Model | Condition | Recorded / planned | Failed | Reference-match proxy | Extractor hits | Warnings | Median wall (s) |
|---|---|---:|---:|---:|---:|---:|---:|
| qwen3:0.6b | A1 | 133/133 | 0 | 13/133 | 0 | 98 | 4.813 |
| qwen3:0.6b | A12 | 133/133 | 0 | 14/133 | 0 | 85 | 4.530 |
| qwen3:0.6b | A2 | 133/133 | 0 | 25/133 | 94 | 81 | 5.933 |
| qwen3:0.6b | B4 | 133/133 | 0 | 23/133 | 95 | 92 | 4.883 |

B4 is the same control already counted in the baseline table; it is not another independent replicate. A2 removes only M7 blocking_flags, retaining structural/currency guards.
