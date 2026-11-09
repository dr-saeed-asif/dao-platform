# CyberDAO experimental results

Evaluation date: 9 November 2026 (Europe/Paris). This is a measured development pilot. The cases are purposive and overlap two demo proposals in the model comparison. Results should not be presented as a population estimate or a definitive model ranking.

## Experiment status

| Experiment | Status | Evidence |
|---|---|---|
| E1 Answer accuracy | Completed as planned for the small-model pilot; direct specialist check completed | Independently checked SQL/PDF gold. Lexical gold coverage is reported below. Blinded, independent semantic accuracy ratings were not collected. |
| E2 Citation reliability | Completed for structural checks and scripted repair; live semantic assessment limited | Final-answer reference counts, deterministic claim flags and controlled challenge. Live repair rate is unavailable if no live rejection occurs. |
| E3 Baseline comparison | Completed as planned for the small-model pilot; default model interrupted | LLM-only, forced single evidence worker, specialist gate off, and full. The gate-off variant retains synthesis checks. A full verification-free ablation was not attempted. |
| E4 Governance authorization | Completed for tested paths | Python and Nest tests, local Ganache and six live negative HTTP probes. Formal verification and a security audit were not attempted. |
| E5 Chain consistency | Completed for four demo proposals | Read-only deployed-chain checks and independent SQL snapshot. Per-proposal chain reads were pinned to different blocks. |
| E6 Performance | Completed as planned for the in-process pilot | Per-attempt wall time, retrieval and measured workflow tokens. FastAPI SSE is measured separately. Wallet/browser timing and load testing were not attempted. Metered cost unavailable. |

The report retains failed calls or failed synthesis warnings as separate outcomes. A final response can complete through a fallback and still miss the gold fact. The default-model campaign stopped after one completed attempt because of runtime. The interrupted attempt has no complete run record and is excluded from measurement denominators. No other default-model comparisons were attempted. Publication-scale semantic assessment is blocked by the absence of a held-out multi-DAO sample and independent annotators. Metered cost is blocked by the absence of power or billing instrumentation.

## Experimental setup and results

CyberDAO was evaluated on Windows 11 against an existing PostgreSQL/pgvector demo database and a local Ollama instance. The audited revision implements six governance specialists, a supervisor, and synthesis. Gold values were extracted independently from SQL or the original attached PDF. The same questions were paired across model conditions, in seeded shuffled order. Details, code revisions, hashes and runtime configuration appear in the [methodology](METHODOLOGY.md), [implementation audit](../audit/implementation.md) and raw manifests.

### Answer coverage, citations and performance

| Regime | Mode | Completed | Lexical gold hits | First-repeat hits (Wilson 95%) | Valid citation IDs | Fallback/warning runs | Median wall s | Median retrieval ms | Median workflow input/output tokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| pilot-small | worker_gate_off | 8/8 | 8/8 | 4/4 (51.0–100.0%) | 8/8 | 4 | 4.531 | 451.7 | 1201 / 30 |
| pilot-small | single_evidence_worker | 8/8 | 4/8 | 2/4 (15.0–85.0%) | 14/14 | 8 | 4.428 | 1140.0 | 1442 / 38 |
| pilot-small | full | 8/8 | 8/8 | 4/4 (51.0–100.0%) | 8/8 | 4 | 4.955 | 459.4 | 1201 / 30 |
| pilot-small | llm_only | 8/8 | 0/8 | 0/4 (0.0–49.0%) | — | 0 | 9.764 | — | 64 / 15 |
| pilot-v1 | worker_gate_off | 1/1 | 1/1 | 1/1 (20.7–100.0%) | 1/1 | 0 | 120.141 | 0.0 | 1146 / 28 |
| direct-db | direct_specialist | 12/12 | 12/12 | 4/4 (51.0–100.0%) | 12/12 | 0 | 0.157 | 0.0 | 0 / 0 |

Observed lexical hits were **full 8/8, worker_gate_off 8/8, single_evidence_worker 4/8, llm_only 0/8**. Forced evidence retrieval recovered the document budgets but missed the structured database facts in this sample. Full and worker-gate-off had identical gold-hit counts. No full-condition worker citation check was rejected in this pilot, so there is no live repair-rate denominator. The scripted challenge is the evidence for repair behavior. The first small-model gate-off attempt was a 93.1 s latency outlier. Runtime conditions were not reset or controlled sufficiently to attribute it to the ablation.

The small-model comparison used four questions, two repeats per mode, and `qwen3:0.6b` for planning and writing. The default-model observation used `qwen3:4b-instruct`. The direct specialist check used supplied intents on four database questions with three repeats, bypassing planning and final writing. It is a component measurement. Empty reference denominators are shown as dashes. Planner latency is included in wall time where applicable, and planner token counts are excluded. Retrieval and token sample counts, bootstrap intervals, run-level flags and check overhead are in [analysis](../analysis/). Intervals are descriptive; cases were not randomly sampled and overlap proposals. No significance tests or population claims are supported.

Operator-authenticated FastAPI streaming completed 3/3 requests for the same title question. Median to first answer section was 3.318 s and median to the final SSE event was 3.430 s. This includes conversation validation and persistence. It excludes Nest, wallet interaction and the browser. All three temporary conversations were deleted successfully. The small repeated sample does not support tail-latency estimates or a generalization interval. See [streaming statistics](../analysis/streaming-summary.json), [table](../tables/streaming.csv) and [figure](../figures/streaming-latency.svg).

In the full condition, median planning time was **2.086 s**, and median specialist citation-check time per run was **2.339 ms** across 8 instrumented runs. The latter covers the specialist gate only. Paired hit counts and exploratory latency intervals are in [paired analysis](../analysis/pilot-small-paired.json).

The controlled citation gate agreed with the expected structural label on **8/8** selected cases. It rejected both invalid-ID cases and the missing-reference case. The scripted repairable case completed on attempt two, the persistent invalid citation failed after two attempts, and the valid case completed on its first attempt. Those are control-flow observations, not an empirical repair probability for generated answers.

The automatic claim checker flagged an absent numerical value, but accepted a wrong-field claim of 10 votes when the source recorded 0 votes and 10 assigned members. It left an unsupported cancellation claim and the tested missing-vote wording unchecked. These failures show why structural citation accuracy and numeric-presence checks are insufficient as semantic support metrics.

An unblinded source inspection of all four first-repeat full answers found **15/16** factual assertions supported by returned evidence and **14/16** with an explicit citation. All four directly requested facts matched gold. The unsupported claim said the evidence contained no other vote details, although the source included an option-index breakdown. The two document answers used the specialist fallback after unsuccessful synthesis. This review was done by the research assistant and has no independent reviewer agreement measurement. See [claim annotations](../analysis/first-pass-claim-review.csv).

### Governance authorization

Python suite **243 passed**. Nest suite **65 passed, 3 skipped**, across 12 passing and one skipped suite. These totals include non-security tests. The isolated Ganache suite **4 passed**, covering owner-only creation, assignment, voting eligibility and duplicate rejection, and finalization. The live authorization probe set produced **6/6** expected responses, including 401 for missing/forged wallet or operator credentials and 403 for a mismatched DAO with valid operator credentials. These are specific test results. They do not establish formal contract security or comprehensive information isolation.

A second live probe set used ephemeral wallets to sign only authentication challenges. **5/5** responses matched the predeclared status, including successful login, denied replay, denied wrong signer, and denied proposal access for a signed-in nonmember. No transaction was signed.

### Chain reconciliation

| Demo proposal | Snapshot block | Overall | Verified rows | Mismatch rows | Unverified rows | Chain events | HTTP wall s |
|---|---:|---|---:|---:|---:|---:|---:|
| pilot | 20254271 | verified | 24 | 0 | 0 | 11 | 3.330 |
| training | 20254273 | mismatched | 28 | 1 | 2 | 14 | 3.161 |
| cleanup | 20254274 | verified | 23 | 0 | 0 | 10 | 4.034 |
| testing | 20254276 | verified | 14 | 0 | 0 | 1 | 6.309 |

The training proposal reported database `FINALIZED` and chain voting state `Closed`, a status mapping discrepancy. Its winning option and tie checks were unverified. Indexed vote counts, stored proposal totals and chain vote counts agreed in these four snapshots. This does not show a corrupted vote or attack. Database reads were current rather than historical at an independently verified index checkpoint. The events and comparisons are nested under each proposal, so their rows cannot be treated as independent samples. Figure [live reconciliation](../figures/live-reconciliation.svg) shows comparison counts. The [latency figure](../figures/pilot-small-latency.svg) shows individual measurements.

## Limitations and evidence needed for journal submission

- Use a held-out dataset sampled across independent DAOs, proposal types and document styles. Include multipart requests, ambiguous and unauthorized inputs, missing data, genuine chain inconsistencies and indexing lag. Freeze block and index checkpoints and preserve the source bytes or checksums.
- Predeclare a correctness rubric and collect independent blinded reviews for the full answer and individual claim-to-evidence links. Report reviewer agreement, adjudication and case-level uncertainty. Treat abstention as a separate outcome from incorrect assertions and execution failure.
- Run complete paired comparisons with multiple model seeds/settings and hardware conditions, controlling model cache order and planner variability. A fuller ablation should disable all verification gates only in a research harness. Use common prompts where possible and separate per-stage contributions.
- Measure full authenticated API/SSE latency, planner and synthesis tokens, tail latency at larger sample sizes, index freshness, concurrency and metered cost if applicable.
- Test additional authorization paths against isolated deployments and obtain independent security review before making broader security claims. The anomaly UI has not been tested on labeled fault injections in this study.

Raw records, derivations and commands are in [reproduction instructions](../experiments/REPRODUCE.md). The raw export preserves observed answers and sanitized source projections. Exact source/row identifiers for public demo proposals are retained where necessary to reproduce the tests. Saved observations and derived counts were cross-checked without re-executing experiments; see [validation record](../audit/artifact-validation.json). File hashes are recorded in [artifact provenance](../audit/provenance.json). An exportable [LaTeX comparison table](../tables/pilot-small.tex) accompanies the CSV tables. Structural reference counts measure identifier validity and cannot establish semantic support.
