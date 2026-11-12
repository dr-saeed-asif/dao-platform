# Failure analysis
{
  "qwen3:0.6b / A1": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 120,
    "nonempty_without_canonical_citations": 0,
    "flagged_factual_claims": 30,
    "unchecked_claims": 234
  },
  "qwen3:0.6b / A12": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 119,
    "nonempty_without_canonical_citations": 0,
    "flagged_factual_claims": 46,
    "unchecked_claims": 234
  },
  "qwen3:0.6b / A2": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 108,
    "nonempty_without_canonical_citations": 0,
    "flagged_factual_claims": 54,
    "unchecked_claims": 278
  },
  "qwen3:0.6b / B1": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 120,
    "nonempty_without_canonical_citations": 133,
    "flagged_factual_claims": 46,
    "unchecked_claims": 3
  },
  "qwen3:0.6b / B2": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 94,
    "nonempty_without_canonical_citations": 133,
    "flagged_factual_claims": 101,
    "unchecked_claims": 19
  },
  "qwen3:0.6b / B3": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 125,
    "nonempty_without_canonical_citations": 133,
    "flagged_factual_claims": 31,
    "unchecked_claims": 2
  },
  "qwen3:0.6b / B4": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 110,
    "nonempty_without_canonical_citations": 0,
    "flagged_factual_claims": 48,
    "unchecked_claims": 278
  },
  "qwen3:4b-instruct / A1": {
    "attempts": 133,
    "no_final_answer": 7,
    "timeouts": 7,
    "transport_errors": 7,
    "reference_proxy_not_matched": 77,
    "nonempty_without_canonical_citations": 1,
    "flagged_factual_claims": 193,
    "unchecked_claims": 392
  },
  "qwen3:4b-instruct / A12": {
    "attempts": 133,
    "no_final_answer": 6,
    "timeouts": 6,
    "transport_errors": 6,
    "reference_proxy_not_matched": 49,
    "nonempty_without_canonical_citations": 1,
    "flagged_factual_claims": 267,
    "unchecked_claims": 491
  },
  "qwen3:4b-instruct / A2": {
    "attempts": 133,
    "no_final_answer": 8,
    "timeouts": 8,
    "transport_errors": 8,
    "reference_proxy_not_matched": 57,
    "nonempty_without_canonical_citations": 1,
    "flagged_factual_claims": 228,
    "unchecked_claims": 486
  },
  "qwen3:4b-instruct / B1": {
    "attempts": 133,
    "no_final_answer": 0,
    "timeouts": 0,
    "transport_errors": 0,
    "reference_proxy_not_matched": 116,
    "nonempty_without_canonical_citations": 133,
    "flagged_factual_claims": 68,
    "unchecked_claims": 0
  },
  "qwen3:4b-instruct / B2": {
    "attempts": 133,
    "no_final_answer": 26,
    "timeouts": 26,
    "transport_errors": 26,
    "reference_proxy_not_matched": 86,
    "nonempty_without_canonical_citations": 105,
    "flagged_factual_claims": 214,
    "unchecked_claims": 4
  },
  "qwen3:4b-instruct / B3": {
    "attempts": 133,
    "no_final_answer": 26,
    "timeouts": 26,
    "transport_errors": 26,
    "reference_proxy_not_matched": 115,
    "nonempty_without_canonical_citations": 98,
    "flagged_factual_claims": 111,
    "unchecked_claims": 23
  },
  "qwen3:4b-instruct / B4": {
    "attempts": 133,
    "no_final_answer": 7,
    "timeouts": 7,
    "transport_errors": 7,
    "reference_proxy_not_matched": 69,
    "nonempty_without_canonical_citations": 1,
    "flagged_factual_claims": 181,
    "unchecked_claims": 417
  }
}

Labels overlap. Per-question metrics and raw provider records retain evidence. The source-page errors and scoring-enum correction are research-harness defects, preserved with pre-fix versions. No gold or output was changed.

Original development smoke preserved 18 completed attempt records: 14 small-model and four larger-model, including two 4B timeouts. The number of additional in-flight requests lost during interruption is unknown; 18 is the recorded-output denominator, not a claim of complete start-event accounting. The preflight listing limit100 violated the documented maximum50; v2 changes only the research inspection request and recognizes the count tool's direct-result contract. The remaining database-backed smoke was blocked by Docker's analytics-socket startup failure.

Historical routing coverage, synthesis framing and wrong budget-label failures remain under ../research_evaluation/failure_diagnosis/. Two historical B4 claims passed structural validation despite wrong field-value support. They remain documented and are not erased by later M7 tests. New full-cohort orchestration underperformance cannot be attributed without B3/B4 execution. The challenge found unchecked PDF table relationships and attribution/coverage tradeoffs, not general semantic correctness.

## Restored database and live-phase update
Database access was restored. All public-table fingerprints, selected SQL records/chunks and model digests match the earlier capture; 195 AI module hashes remain unchanged. See live_campaign/evidence/phase_equivalence.json. Only the ten missing smoke keys were executed; earlier completed keys were reused. The live campaign has 1330/1,330 saved model-workflow attempts; completion=True. B1 and frozen-corpus RAG retain their 532 completed attempts. No original result, gold answer or production source was changed. B4 denotes the current full AI graph and gates with frozen external chain-report replay and trusted in-process operator context. It is not a live end-to-end C4/C7/authentication test. The archived verifier source differs from current C7 source; current reconciliation findings remain separate (live_campaign/evidence/chain_replay_scope.json).

The new direct-SQL baseline executed 26/26 applicable DB questions with 26/26 exact scalar agreements, zero LLM calls. Its hand-coded field selector is an oracle-like lookup baseline, not general text-to-SQL reasoning or independent gold validation. Other categories are outside this baseline's applicability. Four proposal-type items (DB-008/018/028/038) expect a database field absent from registered AI tool projections and the archived chain reports. They remain in all 133-item exploratory denominators, with access-aware expected-behavior adjudication pending; gold was not changed. Thus the SQL oracle has a broader projection for these four items and is not an equivalent-tool baseline. See live_campaign/evidence/proposal_type_access_check.json.

Live SQL and fixed-corpus RAG use identical captured facts/chunks, but execution phases and retrieval implementations differ. Raw outputs support independent reanalysis; live inference reproduction additionally requires the original authorized PostgreSQL/index snapshot and configuration, which are not a self-contained public database image. Model aliases/templates/weight-blob identifiers are frozen in evidence/model_recreation_metadata.json. Wire request digests were computed before privacy redaction; public sanitized payloads may therefore have different hashes, separately counted from model/configuration mismatches. Effective model attribution uses normalized provider requests and provider responses; application model_used/trace labels can retain the originally requested default name under the research interceptor. These are model regimes, not an isolated parameter-count scaling experiment. Decoding/model versions match; hardware residency, cache state and queueing are not controlled enough for a causal latency-overhead claim. Operational completed/returned counts include bounded fallback text and do not establish task success; worker failures and warnings remain in raw records. Every case uses the declared model/call/deadline budgets. The legacy live-run started_utc field is assigned at completion; it is retained unchanged and labelled as a completion timestamp in derived metrics. Monotonic wall_ms remains the observed duration. Full baselines and ablations are real model executions, not copied predictions.

## Provisional output review and arithmetic coverage
Eight predeclared purposive answer targets were reviewed by the research assistant AI, without independent human adjudication. The four 0.6B answers included one factually correct budget answer lacking canonical citations, two incorrect answers and one partial answer. The four 4B targets included three factually correct answers with noncanonical citations and one timeout. This is a diagnostic sample, not cohort accuracy. Four selected 0.6B numeric atoms included two supported and two contradicted claims; see diagnostic_answer_review.csv and raw/diagnostic_claim_review.json.

A controlled replay found that both the legacy amount guard and M7 flag check withhold the correct derived sum EUR 6,000 + EUR 3,000 = EUR 9,000 when 9,000 is absent from the literal sources. This documents a direct-value coverage/design limitation, not evidence that the arithmetic is wrong. A2 retains the legacy guard, so its results measure the incremental M7 gate, not removal of all numerical verification. No production fix was applied. See raw/arithmetic_guard_replay.json.

## Final resumed collection
All1,862 records retained; hard failures 84/1,862 =38 historical +46 new. Outer-error classes: {'ReadTimeout': 43, 'TimeoutError': 37, 'No final answer without outer exception': 4}. These classes describe observed exceptions, not proven provider root causes. Worker errors/warnings and bounded fallback answers remain separate in failure_taxonomy.json and per_question_automatic_metrics.csv; labels overlap. Exact failed keys/raw references:FAILED_RUNS.csv. No failed answer was excluded from proxy denominators.

Why plain RAG can exceed the full graph on this proxy: the frozen corpus is small and directly supplies numeric anchors, while the full graph adds planning, routing, synthesis and conservative gates. Four saved0.6B B4 diagnostic cases show unrequested planner expansion, task substitution, fallback placeholders and treating budget-line ordinals as monetary inputs. A separate controlled replay rejected a correct computed9,000 total absent literally in evidence; this demonstrates a gate limitation, not the cause of every benchmark miss. A2 disables M7 blocking only and retains the legacy currency guard, so its effect is incremental. See raw/current_workflow_diagnostic.json and raw/arithmetic_guard_replay.json. These purposive observations do not establish prevalence or a causal decomposition of final scores.

The proxy itself accepts pooled numeric anchors even with wrong field labels and can miss valid paraphrases. Eight purposive RAG answer reviews and four numeric-claim checks expose such errors; they are AI-assisted, not human-adjudicated or representative. Thus RAG's higher proxy count does not prove better semantic accuracy. Architecture-specific prompts, four unavailable field projections, timeout/call-budget losses and normalized planner decoding also limit the comparison. No production behavior, gold answers or experimental outputs were changed to improve results.

## Earlier exclusions (separate campaigns)
{"prior_harness_invalid": {"path": "research_evaluation/failure_diagnosis/excluded_attempt_taxonomy.json", "count": 18, "sha256": "5f05c143a77509b9173b75b7a7c2a265e9e8ca83f71b38509a34565abd2e8e87"}, "prior_gold_title_contamination": {"path": "research_evaluation/benchmark_200/review/excluded_attempts.json", "count": 4, "sha256": "d891674de8fadf604ab953a33323eb784de1b04869a16c0300c7cad835ce6050"}}
These earlier raw observations remain preserved. This campaign retains all1,862 expected observations, including operational failures; no post-hoc exclusion was used to improve scores. See HISTORICAL_EXCLUSION_ACCOUNTING.json.
