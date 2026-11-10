# Benchmark readiness: NO-GO for confirmatory or larger comparison

## Actual execution environment

The research interpreter loaded planning.py and synthesis.py from the AI repository with hashes exactly matching workflow_fix_v1. The smoke ran the actual source workflow in-process, not the HTTP AI deployment. Running-server deployment remains unverified. Source bundle, interpreter, dependencies, hardware and model digests are saved.

Eight real-model observations were executed on two development questions, two per B1–B4. No reserved question ID was submitted, and the 133-question file hash is unchanged. Development wording reuses already exposed training facts; this is intentionally not a held-out accuracy cohort. Two pre-generation setup launches failed (Windows event loop and a relative-path hashing bug). Both are retained separately, with zero chat calls. The corrected runner uses a Windows SelectorEventLoop. No original experiment or gold file was changed.

The effective model was `qwen3:4b-instruct`, digest `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`, on Ollama 0.40.5. All 20 recorded chat calls used the same options, with a common six-chat and 200-second cap. This model differs from the previous 0.6B pilot, so these observations cannot estimate the effect of the workflow fix. Architecture-specific prompts and actual inference counts differ by design. All sanitized requests, schema constraints, tool calls and provider outputs are retained in responses.jsonl. Request hashes refer to pre-redaction normalized bytes; credentials/authorization headers are never recorded.

## Citation findings

All six previously rejected outputs have no bracketed source references. Two DB-016 outputs name bare D1/D2 and lack SQL metadata evidence after misrouting. Four bounded-unknown outputs contain no source markers despite returned PDF passages supporting absence/unknown responses. They are completed model generations with citation-instruction noncompliance, not empty output or network failures. Missing positive facts in the bounded-unknown items are expected unknowns, not established retrieval faults. These diagnoses overlap and do not imply six identical causes.

Eight structural probes and five active-synthesis probes behaved as implemented. Unknown D/G IDs reject, including a mix of known and unknown IDs. Exact abstention is structurally allowed but the synthesis stage still requires a cited source. **Blind spot:** an unsupported `[B987]` or malformed `[D 987]` can be ignored when a valid `[D1]` is present. The offline strict metric separately flags such markers. Structural validity is not factual support. The two original B4 budget-relation failures remain unchanged. A separate injected-exception test confirmed the B3 ablation restores the active gate afterward.

## Development smoke measurements

| Variant | Attempts | Status completed | Fallbacks | Answers with recognized IDs | Strict-valid among cited answers | Median wall s | Input/output tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| B1 | 2 | 2 | 0 | 0 | 0 | 9.51 | 366/204 |
| B2 | 2 | 1 | 0 | 1 | 1 | 74.65 | 22867/942 |
| B3 | 2 | 2 | 0 | 2 | 2 | 50.08 | 5448/846 |
| B4 | 2 | 2 | 1 | 2 | 2 | 75.06 | 5448/868 |

Status completed does not mean the answer is correct or useful. Reference validity does not mean claim support. B1 has no retrieval, so source-reference comparisons have different applicability. There are two purposive observations per variant, no human correctness/claim ratings and no population confidence intervals or significance claims. Token totals include observed chat calls; embedding preflight is separate. Latency is local descriptive wall time under uncontrolled host/cache conditions. No API/operating cost was measured. Failure/usage details and exact source-line references are in observation_metrics.json.

## Equivalent-tool baseline and evidence

B2 uses the same 22 build_tools definitions and schemas, ExecutionContext, read-only pool, evidence extraction and canonical citation registry as the full workflow. Three backend families (proposal, voting facts and document retrieval) passed real preflight. B2 is model-directed with no specialist planning and no forced tool choice or answer fallback. B3 preserves the previous research ablation, disabling reference, currency and numeric blocking gates. B4 retains them. Tool scope/auth checks are unchanged in production.

The corpus was frozen within one exported PostgreSQL MVCC snapshot, including indexed PDF content. A fresh corrected-verifier capture used that SQL snapshot; all tool-equipped variants could replay identical scoped chain evidence. This is actual SQL and actual model generation with captured-chain replay, not live RPC on each model call. Historical SQL-at-chain-block alignment is still unproven. Snapshot IDs expire after execution; resuming requires identical fingerprints/configuration and stored chain bytes. This does not freeze the adjudicated answers for all 133 remaining candidates.

Generic tool-policy equivalence is **not yet established**: B2 restricts comparison proposal_a/proposal_b to the development proposal, whereas full research workers can compare multiple proposals within the DAO. Tool-name/schema parity alone does not prove identical permissions. No development question requested cross-proposal comparison. A separate candidate_v2 removes this comparison-only restriction while retaining DAO and direct-proposal scope checks; its five fixture tests pass. Backend comparison still reads each proposal with DAO ownership validation. The candidate was not substituted into any saved run. Positive same-DAO multi-proposal backend preflight and affected live development validation remain pending. Prompts remain architecture-specific and the final policy/rubric needs prospective declaration before a broader comparison.

## Decision and exact gates

- **GO completed:** bounded development smoke and descriptive protocol diagnostics. Actual mistakes and fallbacks are retained, with no score-based exclusions.
- **NO-GO larger exploratory comparison:** first reconcile/validate generic B2 comparison-scope access, freeze a new cohort/evidence configuration, and predeclare uniform scoring including strict citation syntax versus factual support. EXPLORATORY_PROTOCOL.json prepares this regime without executing it.
- **NO-GO confirmatory campaign:** additionally obtain appropriate independent human adjudication. Current independent human count is zero. The 133 reserved candidates remain untouched. New cohort evidence must be aligned/frozen and evidence/claim annotations completed. No automatic full-campaign path is enabled here.

Known application limitations (uncited generations, irrelevant-source routing, semantic citation errors and malformed-namespace blindness) are findings, not reasons to remove observations. These data support harness/environment diagnostics and measured failure examples, not multi-agent superiority or a human-validated benchmark.

## Reproduction

From the AI repository use its .venv/Scripts/python.exe, with that directory on PYTHONPATH, to run validate.py, then run_smoke.py, then analyze.py under this artifact directory. Validation is exclusive-version guarded. The runner checkpoints every attempted development pair and skips completed attempts, including failures. Config/source/model/fingerprint mismatches abort resumption. Do not rerun the completed version to obtain better answers; copy scripts into a new version for changed conditions. Chain capture needs the configured read-only database/RPC environment and existing DAO build. No private .env files are included. See tool_schemas.json, config.json, static_checks.json, preflight.json, protocol_audit.json and provenance.json.
