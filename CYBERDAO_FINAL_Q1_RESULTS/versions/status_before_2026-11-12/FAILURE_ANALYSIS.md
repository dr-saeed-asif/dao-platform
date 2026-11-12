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
    "attempts": 9,
    "no_final_answer": 3,
    "timeouts": 3,
    "transport_errors": 3,
    "reference_proxy_not_matched": 8,
    "nonempty_without_canonical_citations": 6,
    "flagged_factual_claims": 7,
    "unchecked_claims": 1
  }
}

Labels overlap. Per-question metrics and raw provider records retain evidence. The source-page errors and scoring-enum correction are research-harness defects, preserved with pre-fix versions. No gold or output was changed.

Original development smoke preserved 18 completed attempt records: 14 small-model and four larger-model, including two 4B timeouts. The number of additional in-flight requests lost during interruption is unknown; 18 is the recorded-output denominator, not a claim of complete start-event accounting. The preflight listing limit100 violated the documented maximum50; v2 changes only the research inspection request and recognizes the count tool's direct-result contract. The remaining database-backed smoke was blocked by Docker's analytics-socket startup failure.

Historical routing coverage, synthesis framing and wrong budget-label failures remain under ../research_evaluation/failure_diagnosis/. Two historical B4 claims passed structural validation despite wrong field-value support. They remain documented and are not erased by later M7 tests. New full-cohort orchestration underperformance cannot be attributed without B3/B4 execution. The challenge found unchecked PDF table relationships and attribution/coverage tradeoffs, not general semantic correctness.

## Restored database and live-phase update
Database access was restored. All public-table fingerprints, selected SQL records/chunks and model digests match the earlier capture; 195 AI module hashes remain unchanged. See live_campaign/evidence/phase_equivalence.json. Only the ten missing smoke keys were executed; earlier completed keys were reused. The live campaign has 674/1,330 saved model-workflow attempts; completion=False. B1 and frozen-corpus RAG retain their 532 completed attempts. No original result, gold answer or production source was changed. B4 denotes the current full AI graph and gates with frozen external chain-report replay and trusted in-process operator context. It is not a live end-to-end C4/C7/authentication test. The archived verifier source differs from current C7 source; current reconciliation findings remain separate (live_campaign/evidence/chain_replay_scope.json).

The new direct-SQL baseline executed 26/26 applicable DB questions with 26/26 exact scalar agreements, zero LLM calls. Its hand-coded field selector is an oracle-like lookup baseline, not general text-to-SQL reasoning or independent gold validation. Other categories are outside this baseline's applicability. Four proposal-type items (DB-008/018/028/038) expect a database field absent from registered AI tool projections and the archived chain reports. They remain in all 133-item exploratory denominators, with access-aware expected-behavior adjudication pending; gold was not changed. Thus the SQL oracle has a broader projection for these four items and is not an equivalent-tool baseline. See live_campaign/evidence/proposal_type_access_check.json.

Live SQL and fixed-corpus RAG use identical captured facts/chunks, but execution phases and retrieval implementations differ. Raw outputs support independent reanalysis; live inference reproduction additionally requires the original authorized PostgreSQL/index snapshot and configuration, which are not a self-contained public database image. Model aliases/templates/weight-blob identifiers are frozen in evidence/model_recreation_metadata.json. Effective model attribution uses normalized provider requests and provider responses; application model_used/trace labels can retain the originally requested default name under the research interceptor. These are model regimes, not an isolated parameter-count scaling experiment. Decoding/model versions match; hardware residency, cache state and queueing are not controlled enough for a causal latency-overhead claim. Operational completed/returned counts include bounded fallback text and do not establish task success; worker failures and warnings remain in raw records. Every case uses the declared model/call/deadline budgets. The legacy live-run started_utc field is assigned at completion; it is retained unchanged and labelled as a completion timestamp in derived metrics. Monotonic wall_ms remains the observed duration. Full baselines and ablations are real model executions, not copied predictions.

## Provisional output review and arithmetic coverage
Eight predeclared purposive answer targets were reviewed by the research assistant AI, without independent human adjudication. The four 0.6B answers included one factually correct budget answer lacking canonical citations, two incorrect answers and one partial answer. The four 4B targets included three factually correct answers with noncanonical citations and one timeout. This is a diagnostic sample, not cohort accuracy. Four selected 0.6B numeric atoms included two supported and two contradicted claims; see diagnostic_answer_review.csv and raw/diagnostic_claim_review.json.

A controlled replay found that both the legacy amount guard and M7 flag check withhold the correct derived sum EUR 6,000 + EUR 3,000 = EUR 9,000 when 9,000 is absent from the literal sources. This documents a direct-value coverage/design limitation, not evidence that the arithmetic is wrong. A2 retains the legacy guard, so its results measure the incremental M7 gate, not removal of all numerical verification. No production fix was applied. See raw/arithmetic_guard_replay.json.
