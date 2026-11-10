# Benchmark readiness: NO-GO for a larger campaign

**GO completed:** bounded development diagnostics. **NO-GO confirmatory:** independent human adjudication and cohort evidence-freeze gates are unmet. **NO-GO larger exploratory:** freeze the new cohort/evidence and prospectively declare scoring and repeated-run handling first. No full campaign was started.

## Environment and configurations actually validated

The real in-process execution loaded the fixed planning and synthesis modules at their workflow_fix_v1 hashes. This does not establish deployment of the HTTP AI server. Nine model observations were retained: eight B1–B4 diagnostic observations over two development questions, plus one separately versioned affected B2 retest. The 133 reserved questions were not submitted and their manifest hash is unchanged. Development prompts reuse already exposed training facts; they are not held-out accuracy questions.

The effective model was qwen3:4b-instruct, digest `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`, on Ollama 0.40.5. All 26 chat requests used identical normalized decoding: temperature 0, seed 42, context 8192, output cap 1536, top_p 0.8, top_k 20 and repeat_penalty 1.1. Each observation had the same six-chat/200-second cap. Effective provider model settings take precedence over caller-model trace labels. Architecture-specific prompts, tool definitions and actual call counts differ and are recorded, not claimed identical. The model digest remained unchanged after execution. These 4B results must remain separate from the earlier 0.6B pilot.

One exported read-only PostgreSQL snapshot per execution includes the indexed PDF corpus. The corrected verifier captured chain evidence with that SQL snapshot. All tool-equipped variants used identical captured-chain replay. The affected retest verified identical full-public-table fingerprints, chain bytes and production-source bundle before proceeding. This is genuine model/SQL execution with chain replay, not live RPC on every tool call. It does not reconstruct historical SQL-at-chain-block state or freeze all remaining benchmark gold evidence. Snapshot transactions expire; resumption requires matching fingerprints and configuration.

## Citation findings and gate behavior

All six previously rejected outputs lacked bracketed references. Two named bare D1/D2 and lacked the requested SQL evidence after misrouting; four bounded-unknown answers supplied no citations despite relevant passages. These were nonempty completed model generations, not HTTP failures. Absence of a positive fact in a bounded-unknown item is expected, whereas missing SQL evidence in DB-016 is a routing/coverage failure. Categories overlap.

Eight structural probes and five active-synthesis checks matched implementation behavior. Unknown D/G IDs reject, including mixed known/unknown IDs. Exact abstention is structurally valid but synthesis still requires cited evidence. Unsupported `[B987]` and malformed `[D 987]` can be silently ignored alongside a valid `[D1]`; the new offline strict metric flags them. The reference gate is not a semantic entailment check. Both original B4 budget-relation failures remain preserved. An injected exceptional exit confirmed that the B3 ablation restores active gates afterward.

## Baseline fairness diagnosis and correction

The initial smoke B2 used the same 22 tool schemas/functions and context as the workflow, but further auditing found two adapter differences: comparison IDs were limited to the selected development proposal, and failed business results became exception-name-only replies. In the failed original B2 mixed-source trial, four chunk requests failed before the six-turn limit; exact business error bodies were not retained. It cannot be attributed solely to model failure. The original failed response remains in the eight-observation diagnostic table, with no score-based exclusion.

Candidate v3, versioned separately, removes the comparison-only restriction while retaining DAO/direct-proposal guards, and preserves structured business errors. Five scope/evidence fixture checks and two new error-transparency checks passed. Actual read-only preflight then confirmed a real same-DAO two-proposal comparison is permitted by both candidate and full research worker with identical backend results; a wrong-DAO request was rejected. This is one observed positive/negative pair, not comprehensive permission verification or wallet-membership authentication.

Only the error-feedback-affected B2 development pair was retested. Its status was `completed`, with 6 chat calls and 124.36 s wall time. Structured `chunk_not_found` feedback was preserved. The model subsequently obtained voting facts and produced a final response, but still did not retrieve the requested PDF allocation. No whole-answer correctness or improvement claim follows. This retest is not substituted into or pooled with the original eight-case table.

## Actual denominators and limitations

The original development matrix has 8 attempts: 7 reported completed and 1 failed. One completed B4 observation used fallback text. All 20 original chat requests returned HTTP 200. Citation-ID validity is scored separately from factual support. The separate candidate observation brings retained model observations to 9, with zero excluded. Three setup launches failed before any chat call (Windows loop, relative-path hashing, and a one-case preflight indexing bug); their scripts/errors/configurations remain archived, separately from model-trial denominators.

See smoke_metrics.csv and observation_metrics.json for the original matrix, and candidate_v3_validation.json for the separate follow-up. There are no independent human whole-answer or exhaustive claim-support scores. No confidence interval, significance test, operating-cost estimate or architectural-superiority claim is justified by this two-question purposive smoke. Host/cache load was uncontrolled.

For the SQL development question, B3 and B4 had identical normalized planner request hashes but different planner outputs despite temperature 0 and seed 42. The other paired request produced identical outputs. The cause is unresolved; fixed seeds do not establish bitwise determinism here. A larger protocol must declare repetitions and handle proposal/question dependence before uncertainty analysis.

## Remaining gates and reproducibility

- Freeze the eligible cohort, source/gold snapshots and complete run configuration in a new campaign version. Existing development snapshots do not satisfy all remaining benchmark evidence requirements.
- Predeclare whole-answer scoring, exhaustive atomic claim support, structural/strict citation checks, abstention/error categories and reviewer independence. Human adjudication remains pending for confirmatory findings.
- Declare repeated runs and dependence-aware uncertainty analysis. Keep prompts, effective/requested model labels, evidence access, tool errors, failures and fallback text in the raw records.
- Treat the candidate's observed scope/error parity as targeted evidence, not an exhaustive authorization audit. HTTP deployment, wallet eligibility and all tool edge cases remain outside this execution.

The prepared exploratory protocol is EXPLORATORY_PROTOCOL_AFTER_CANDIDATE.json. No automatic full-campaign path is enabled. No production workflow, benchmark gold or prior response was changed in this harness-validation task.

Run scripts from the AI repository using its .venv interpreter and that repository on PYTHONPATH. validate.py performs version-guarded static checks; run_smoke.py checkpoints development attempts and refuses changed configuration; analyze.py derives the initial diagnostic matrix. Candidate source, tests, live comparison probe and the separate candidate_v3_smoke runner are retained. finalize_followup.py builds this updated account without inference. Completed directories must not be reused with changed sources. Configs record model/source hashes, tool schemas and evidence fingerprints. Requests/responses are privacy-redacted; original normalized request hashes are retained and no authorization headers or .env files are exported.

Primary artifacts: static_checks.json, six_citation_failures.json, citation_gate_probes.json, tool_schemas.json, preflight.json, config.json, protocol_audit.json, paired_planner_requests.json, post_run_environment.json, hardware.json, dependencies.json, live_comparison_preflight.json, READINESS_DECISION.json and provenance.json.
