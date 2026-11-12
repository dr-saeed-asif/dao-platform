# Benchmark completion report
**COMPLETE: exploratory collection and analysis. Confirmatory evaluation: NO-GO.**

All 1,862 expected attempt keys are present, unique and parseable: 133 frozen questions × two model regimes × seven conditions. Exactly 623 missing attempts were appended (4B B3:91, B4:133, A1/A2/A12:399); no completed or previously failed attempt was repeated. Original 1,239 records remain byte-for-byte intact. The 38 historical failures are retained; 46 new failures were recorded (84/1,862 total). Failures are observations, not absent runs.

The intervening1,262-record audit with44 failures also remains byte-for-byte intact. Its600 missing keys were filled without retrying any of its44 failed observations; 40 additional failures were recorded after that audit. All14 condition cells contain133 records.

| Model | Condition | Records/planned | Proxy matches | Failed | Warnings | Median/p95 wall (s) |
|---|---|---:|---:|---:|---:|---:|
| qwen3:0.6b | B1 | 133/133 | 13/133 | 0 | 0 | 0.985/1.521 |
| qwen3:0.6b | B2 | 133/133 | 39/133 | 0 | 0 | 2.170/2.988 |
| qwen3:0.6b | B3 | 133/133 | 8/133 | 0 | 0 | 1.258/6.284 |
| qwen3:0.6b | B4 | 133/133 | 23/133 | 0 | 92 | 4.883/10.295 |
| qwen3:4b-instruct | B1 | 133/133 | 17/133 | 0 | 0 | 11.623/27.310 |
| qwen3:4b-instruct | B2 | 133/133 | 47/133 | 26 | 0 | 39.862/100.358 |
| qwen3:4b-instruct | B3 | 133/133 | 18/133 | 26 | 0 | 73.444/200.016 |
| qwen3:4b-instruct | B4 | 133/133 | 64/133 | 8 | 73 | 89.024/200.002 |

| Model | Condition | Records/planned | Proxy matches | Failed | Warnings | Median/p95 wall (s) |
|---|---|---:|---:|---:|---:|---:|
| qwen3:0.6b | A1 | 133/133 | 13/133 | 0 | 98 | 4.813/10.554 |
| qwen3:0.6b | A12 | 133/133 | 14/133 | 0 | 85 | 4.530/8.979 |
| qwen3:0.6b | A2 | 133/133 | 25/133 | 0 | 81 | 5.933/10.853 |
| qwen3:0.6b | B4 | 133/133 | 23/133 | 0 | 92 | 4.883/10.295 |
| qwen3:4b-instruct | A1 | 133/133 | 56/133 | 8 | 74 | 95.076/200.003 |
| qwen3:4b-instruct | A12 | 133/133 | 84/133 | 7 | 41 | 100.144/199.196 |
| qwen3:4b-instruct | A2 | 133/133 | 76/133 | 9 | 43 | 88.628/200.003 |
| qwen3:4b-instruct | B4 | 133/133 | 64/133 | 8 | 73 | 89.024/200.002 |

Tables show automated reference matches, NOT independently validated whole-answer accuracy. All 133 remain in each condition's denominator. Structural citation validity is separate from factual support; a zero-claim or uncited response can be structurally valid. The gate's own labels are not independent claim-support judgments. Whole-answer accuracy remains unestimated. Human annotations/adjudication:0. All 133 questions are exploratory-exposed.

Human-review requirements are separate from execution completion: two reviewers must independently inspect source evidence and author/validate ground truth, annotate answer claims and their cited spans, resolve disagreements through documented adjudication, and freeze evaluation criteria and labels. Existing226-item question-review templates are a larger review pool, not226 benchmark questions; this campaign has133 questions. Post-hoc human review can improve exploratory scoring but cannot retroactively make these exposed questions a prospectively held-out confirmatory evaluation. No new confirmatory campaign is claimed or started here.

SUPPORT_CITATION_ABSTENTION.csv reports automatic factual-claim flag fractions, unchecked-claim fractions, structural citation validity (all attempts and cited answers separately), citation coverage, lexical abstention cues and failures with their denominators. Automatic gate flags are not a measured true unsupported-claim rate; that independently validated rate remains unavailable. Abstention cues may occur inside otherwise substantive answers and do not establish correct abstention. Historical purposive AI-assisted review found2 contradicted atoms among4 selected0.6B RAG numeric atoms (raw/diagnostic_claim_review.json); this is not a representative unsupported-claim estimate. Current transport/source/key validation found no harness-invalid records; operational failures are retained separately, not called invalid and excluded. Earlier excluded development/harness attempts remain separate historical evidence, not silently removed from this campaign.

B1=no retrieval; B2=frozen-document RAG; B3=single agent with the same22 permitted tools; B4=full AI graph/gates with archived chain replay; A1=deterministic helpers disabled; A2=M7 blocking disabled (legacy structural/currency gates retained); A12=both. A_SQL's separate26/26 scalar matches are a hand-coded oracle on applicable DB questions, not part of the1,862 model attempts or equivalent-tool general reasoning baseline.

Frozen digests/settings/SQL fingerprints/source hashes passed preflight and transport checks. Exact prompts/provider responses and tool calls remain in raw files. Every chat stage uses seed42,temperature0.6,context8192,prediction1536,top_p0.8,top_k20,repeat_penalty1.1; six-chat budget,200-second case deadline,concurrency2. Production planner defaults differ: these are normalized research variants. Frozen question and gold files were not edited. Archived chain responses are not new RPC measurements or live C4/C7 tests.

Four shared proposal scopes and few PDFs create dependence. Four proposal-type questions have source-access alignment limitations (DB-008/018/028/038); they were retained without relabeling. Fixed seed, phase/cache/hardware residency and failures confound generalization and latency attribution. Live `started_utc` is a legacy completion timestamp; `wall_ms` is the recorded monotonic duration. The configured200-second async deadline is not asserted to be an absolute observed wall-time bound: overruns beyond201seconds are separately counted and not trimmed. Their scheduling/infrastructure cause is not independently established. B2 generation timing excludes cached retrieval/setup; successful-response tokens are observed counts, missing token reports are unknown, not zero cost.

The common per-case deadline and six-call cap evaluate each architecture under a fixed resource budget. Multi-call workflows may exhaust that budget more often than one-call RAG; this is not an estimate of architecture quality at unlimited compute. B2 has document-only evidence while B3/B4 have22 tools, so their comparison is not a pure architecture-only ablation. No parameters, prompts or gates were tuned against this cohort during continuation.

An offline reporting-metadata defect was identified: the transport checker labelled all HTTP timeouts100seconds. Source inspection shows B1/B2/B3 use100seconds, the full planner uses85seconds within a90-second bound, and full RAG chat uses connect5/read300/write30/pool5seconds subject to outer budgets. These unchanged per-stage timeouts were not identical across architectures. The original checker output is retained in versions/transport_audit_legacy_100s.json; TRANSPORT_TIMEOUT_CLARIFICATION.json records the correction and source hashes. Model/options validation remains separate; no generation setting or output was changed. Internal dynamic workflow deadlines were not independently archived at process startup.

Reproduction: from the AI checkout, use its `.venv/Scripts/python.exe` and existing authorized private configuration; do not publish credentials. `scripts/run_live_remaining.py --prepare` validates frozen sources without chat generation. `scripts/run_live_remaining.py` appends only absent keys; recorded failures are not retried. `scripts/finalize_resume.py` performs offline integrity checks, analysis, figures and sealing. Never start two writers. The original authorized database/index snapshot is required for inference reproduction; archived raw records support offline reanalysis.

Evidence: RESUME_INTEGRITY.json; versions/resume_20261112T065626Z/RESUME_MANIFEST.json; live_campaign/configuration.json; live_campaign/preflight.json; live_campaign/completion.json; transport_configuration_audit.json; per_question_automatic_metrics.csv; paired_descriptive_comparisons.json; raw/current_workflow_diagnostic.json; raw/arithmetic_guard_replay.json; diagnostic_answer_review.csv; evidence/new_exposure_ledger.json. Original outputs, contradictions and failures remain unchanged.
