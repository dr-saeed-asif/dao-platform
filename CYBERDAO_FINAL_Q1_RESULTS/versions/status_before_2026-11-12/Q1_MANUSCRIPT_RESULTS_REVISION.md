# Manuscript replacement text
No manuscript .tex/.docx source was located in the repository/workspace search; this is author-ready replacement prose, not an edited submitted manuscript. No references are invented.

## Abstract
CyberDAO separates advisory AI from governance transaction authority and combines scoped reads, document provenance checks and blockchain reconciliation. An isolated recovery follow-up reconstructed and reconciled39/39 original proposals at a fixed block using one RPC provider. Selected document controls rejected12/12 invalid cases and admitted3/3 valid controls; stale active-chunk cleanup succeeded in one replacement case. RPC fault expectations matched15/16 controlled cases. AI results remain exploratory: gold is AI-assisted, human adjudication is absent, and a database outage delayed the live full-workflow campaign. The evidence supports design feasibility within tested boundaries, not independently validated AI accuracy or blockchain-integrity guarantees.

## Research questions, contributions and methods
Separate engineering consistency/provenance from answer-quality questions. Contribution4 is deterministic field/value/unit/citation checking for selected parseable formats, not entailment. Use current baseline definitions and actual model digests/configurations; retain historical definitions separately. The133-question cohort spans four proposal scopes with two main demonstration PDFs; the retrieval corpus additionally includes the existing cleanup PDF. It is now exposed to exploratory model runs, not a human-approved confirmatory reserve.

## Results
| Model | Condition | Attempts / planned | Returned | Failed | Reference-match proxy | Citation-valid answers | Median wall (s) | Observed input/output tokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| qwen3:0.6b | B1 | 133/133 | 133 | 0 | 13/133 | 0/133 | 0.985 | 23976/6409 |
| qwen3:0.6b | B2 | 133/133 | 133 | 0 | 39/133 | 0/133 | 2.170 | 207890/8508 |
| qwen3:0.6b | B3 | 133/133 | 133 | 0 | 8/133 | 0/133 | 1.258 | 234100/10408 |
| qwen3:0.6b | B4 | 133/133 | 133 | 0 | 23/133 | 133/133 | 4.883 | 325817/25222 |
| qwen3:4b-instruct | B1 | 133/133 | 133 | 0 | 17/133 | 0/133 | 11.623 | 22912/9588 |
| qwen3:4b-instruct | B2 | 133/133 | 107 | 26 | 47/133 | 2/133 | 39.862 | 162737/12572 |
| qwen3:4b-instruct | B3 | 9/133 | 6 | 3 | 1/9 | 0/9 | 97.689 | 26811/1211 |

This table contains reference-match proxies, not answer accuracy. Whole-answer correctness and independent claim support remain unmeasured. Do not insert proxy counts into an accuracy column.

The new24-case provisional claim challenge yielded TP4/FP0/FN4/TN16 with12/24 abstentions. Two semantically true claims deliberately lacked valid attribution. Four of six validly cited supported cases were accepted. Preserve the earlier17-case development results and historical budget-label errors as separate versions. All comparisons are exploratory; selected cases do not establish generalization.

## Discussion, limitations and conclusion
Recovery measures same-provider consistency, not independent chain integrity, finality or absence of silent omissions. Scan progress is distinct from proven completeness. The historical extra SQL assignment linked to a reverted transaction remains preserved in production; isolated recovery does not repair it. Synthetic document anchors/embeddings, selected faults, provisional gold, shared facts, limited source diversity, architecture-specific prompts, GPU/caching effects and phase-specific execution conditions constrain conclusions. No system-superiority or significance claim is justified. Frame the contribution as design-and-feasibility with exploratory AI observations.

## Availability
Use FINAL_SCIENTIFIC_TABLES.md and REPRODUCIBILITY_MANIFEST.json for exact versions, denominators and evidence links. Release only redacted artifacts. Local implementation does not imply deployment, secret rotation or formal security audit.

## Restored database and live-phase update
Database access was restored. All public-table fingerprints, selected SQL records/chunks and model digests match the earlier capture; 195 AI module hashes remain unchanged. See live_campaign/evidence/phase_equivalence.json. Only the ten missing smoke keys were executed; earlier completed keys were reused. The live campaign has 674/1,330 saved model-workflow attempts; completion=False. B1 and frozen-corpus RAG retain their 532 completed attempts. No original result, gold answer or production source was changed. B4 denotes the current full AI graph and gates with frozen external chain-report replay and trusted in-process operator context. It is not a live end-to-end C4/C7/authentication test. The archived verifier source differs from current C7 source; current reconciliation findings remain separate (live_campaign/evidence/chain_replay_scope.json).

The new direct-SQL baseline executed 26/26 applicable DB questions with 26/26 exact scalar agreements, zero LLM calls. Its hand-coded field selector is an oracle-like lookup baseline, not general text-to-SQL reasoning or independent gold validation. Other categories are outside this baseline's applicability. Four proposal-type items (DB-008/018/028/038) expect a database field absent from registered AI tool projections and the archived chain reports. They remain in all 133-item exploratory denominators, with access-aware expected-behavior adjudication pending; gold was not changed. Thus the SQL oracle has a broader projection for these four items and is not an equivalent-tool baseline. See live_campaign/evidence/proposal_type_access_check.json.

Live SQL and fixed-corpus RAG use identical captured facts/chunks, but execution phases and retrieval implementations differ. Raw outputs support independent reanalysis; live inference reproduction additionally requires the original authorized PostgreSQL/index snapshot and configuration, which are not a self-contained public database image. Model aliases/templates/weight-blob identifiers are frozen in evidence/model_recreation_metadata.json. Effective model attribution uses normalized provider requests and provider responses; application model_used/trace labels can retain the originally requested default name under the research interceptor. These are model regimes, not an isolated parameter-count scaling experiment. Decoding/model versions match; hardware residency, cache state and queueing are not controlled enough for a causal latency-overhead claim. Operational completed/returned counts include bounded fallback text and do not establish task success; worker failures and warnings remain in raw records. Every case uses the declared model/call/deadline budgets. The legacy live-run started_utc field is assigned at completion; it is retained unchanged and labelled as a completion timestamp in derived metrics. Monotonic wall_ms remains the observed duration. Full baselines and ablations are real model executions, not copied predictions.

## Provisional output review and arithmetic coverage
Eight predeclared purposive answer targets were reviewed by the research assistant AI, without independent human adjudication. The four 0.6B answers included one factually correct budget answer lacking canonical citations, two incorrect answers and one partial answer. The four 4B targets included three factually correct answers with noncanonical citations and one timeout. This is a diagnostic sample, not cohort accuracy. Four selected 0.6B numeric atoms included two supported and two contradicted claims; see diagnostic_answer_review.csv and raw/diagnostic_claim_review.json.

A controlled replay found that both the legacy amount guard and M7 flag check withhold the correct derived sum EUR 6,000 + EUR 3,000 = EUR 9,000 when 9,000 is absent from the literal sources. This documents a direct-value coverage/design limitation, not evidence that the arithmetic is wrong. A2 retains the legacy guard, so its results measure the incremental M7 gate, not removal of all numerical verification. No production fix was applied. See raw/arithmetic_guard_replay.json.
