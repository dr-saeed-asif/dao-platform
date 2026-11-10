# CyberDAO final paper evidence

This report closes the recorded evaluation. It separates directly verified behavior, exploratory observations and pending evaluations. Each table refers to a specific experimental version. The closeout used saved records and targeted regressions. Model observations, gold answers and historical figures retain their original versions.

## Verified implementation and component behavior

| Change or test scope | Saved result |
|---|---|
| Citation syntax | The verifier now rejects citation-like bracketed markers such as `[B987]` and `[D 987]`, including when `[D1]` is valid. Known canonical references, unknown-ID rejection and the structural abstention rule retain their tested behavior. |
| Routing and synthesis | The explicit-source coverage rule and single-task headerless synthesis handling passed their retained regressions. Earlier saved-output replay restored required routing roles in 8/8 plans and accepted 2/8 headerless answers under active citation checks. Six remained rejected. The two counts overlap within 14 replayed observations. |
| Blockchain status normalization | Database `FINALIZED` maps to contract voting state `Closed`. Finalization, winner and tie remain separate comparisons. |
| Closeout regressions | 79/79 targeted Python tests across nine suites, including six citation-marker tests. All 11/11 Nest verifier tests and 4/4 isolated Ganache contract tests passed. |

The before-fix verifier accepted both confirmed malformed-marker examples alongside a valid reference. The closeout patch addresses structural recognition only. The historical semantic errors remain part of the evidence. Current source and regression hashes identify the tested working-tree changes. Service rollout of the closeout patch is unverified. [Before-fix outputs](closeout/citation_behavior_before.json) · [Python results](closeout/python_regressions.json) · [Verifier results](closeout/blockchain_tests.json) · [Contract results](closeout/contract_regressions.json) · [Workflow replay](workflow_fix_v1/smoke_summary.json)

## Exploratory pilot and observed streaming performance

The small-model pilot used `qwen3:0.6b`, four purposively selected questions across two demo proposals, and two repeats per condition in seeded order. Expected facts came from the scoped database or original PDFs. The outcome is lexical gold-fact coverage. The worker-gate ablation retained synthesis checks and differs from the later B3 ablation. Planner tokens are excluded from the workflow-token column.

| Pilot condition | Completed | Gold-fact matches | Valid recognized citation IDs | Warnings or fallbacks | Median wall time (s) | Median workflow input/output tokens |
|---|---:|---:|---:|---:|---:|---:|
| Full workflow | 8/8 | 8/8 | 8/8 | 4/8 | 4.955 | 1,201 / 30 |
| Worker gate disabled | 8/8 | 8/8 | 8/8 | 4/8 | 4.531 | 1,201 / 30 |
| Forced evidence worker | 8/8 | 4/8 | 14/14 | 8/8 | 4.428 | 1,442 / 38 |
| LLM only | 8/8 | 0/8 | — | 0/8 | 9.764 | 64 / 15 |

The first-repeat counts were 4/4, 4/4, 2/4 and 0/4 in table order. Archived Wilson intervals are descriptive for these purposive cases. Repeats and shared proposal sources limit inference. The full-condition median specialist citation-check time was 2.339 ms across eight runs. Separately, the default 4B campaign archived one completed result with one lexical match and an interruption with no complete measurement. The supplied-intent direct DB component matched 12/12 across four questions and three repeats, with 0.157 s median wall time. Neither is pooled into the 32-run table. [Pilot raw](raw_results/pilot-small/runs.jsonl) · [Config](raw_results/pilot-small/manifest.json) · [Metrics](analysis/pilot-small-summary.json) · [Default regime](analysis/pilot-v1-summary.json) · [Direct DB](analysis/direct-db-summary.json) · [Pilot figure](figures/pilot-small-latency.svg)

| FastAPI streaming milestone | Completed observations | Median (s) | Observed range (s) |
|---|---:|---:|---:|
| Response headers | 3/3 | 1.859 | 1.796–2.195 |
| First answer section | 3/3 | 3.318 | 3.278–3.978 |
| Final SSE event | 3/3 | 3.430 | 3.426–4.126 |

One title question was repeated three times through operator-authenticated FastAPI, including conversation validation and persistence. All three temporary conversations were cleaned up. Nest, wallet and browser timings are outside this measurement. Three repeats do not support tail estimates. Metered cost is unavailable. [Raw SSE](raw_results/http-stream.jsonl) · [Streaming statistics](analysis/streaming-summary.json) · [Figure](figures/streaming-latency.svg)

## Citation structure and factual support

| Evidence unit | Observation | Scope |
|---|---|---|
| Original structural challenge | 8/8 expected labels, including rejection of both unknown-ID cases and the missing-reference case | Selected deterministic fixtures under the historical verifier |
| Scripted repair | Repairable case completed on attempt 2, persistent invalid case failed after attempt 2, valid case completed on attempt 1 | Control flow only. The pilot had zero full-condition worker rejections, so live repair rate is undefined. |
| Pilot claim review | 15/16 supported, 1/16 contradicted and 14/16 explicitly cited | Four first-repeat full answers, unblinded review by the research assistant. The contradiction denied additional vote details although an option-index breakdown existed. |
| Frozen exploratory diagnostic sample | 10/18 supported, 4/18 contradicted by returned sources, 4/18 unsupported by returned sources. Eight contradicted authoritative facts. | Purposive AI-assisted annotations. Four wrong proposal identifiers and four wrong budget-category associations. |
| Budget-category contradictions | Two claims in B4 passed active structural and amount-presence checks. Two further claims occurred in B3 with the checks disabled. | The source assigns EUR 6,000 to security review and EUR 3,000 to dashboard improvements. Both answers associated those amounts with the wrong categories. |
| Headerless outputs still rejected in replay | Two contained bare source IDs and lacked requested SQL evidence after misrouting. Four bounded-unknown answers lacked citations. | Six nonempty outputs. Formatting, routing and evidence limitations overlap. |

The historical numeric checker accepted a wrong-field number present elsewhere in the source and left some unsupported prose unchecked. The closeout syntax fix does not establish factual support. Claim and citation denominators measure different units. No independent human agreement or population support rate is available. [Challenge](raw_results/citation-challenge.json) · [Pilot claim annotations](analysis/first-pass-claim-review.csv) · [Exploratory annotations](exploratory_frozen_v2/diagnostic_claims.csv) · [Budget analysis](failure_diagnosis/CITATION_SUPPORT_ERRORS.md) · [Six rejected outputs](harness_validation_v1/six_citation_failures.json)

## Blockchain reconciliation and controlled faults

The archived cohort included 39 of 40 observed SQL proposals based on non-null on-chain identifiers and matching network and contract. A read-only isolated API compared current SQL records against contract reads pinned per request at 27 distinct blocks. All 39 returned HTTP 200 with zero reported RPC errors. Median wall time was 3.858 s, range 1.792–5.716 s, at concurrency two.

| Run/version | Proposals | Verified | Mismatched | Unverified | Unavailable |
|---|---:|---:|---:|---:|---:|
| Archived pre-alias cohort | 39 | 23 | 7 | 9 | 0 |
| Pre-alias affected subset, included above | 7 | 0 | 7 | 0 | 0 |
| Post-alias targeted recheck | 7 | 0 | 1 | 6 | 0 |

Six discrepancies were status aliases. The corrected isolated runtime verified `Closed` against normalized `FINALIZED`. The six affected proposals remained unverified overall because SQL lacked winning-option or tie data. The other 32 cases were not remeasured. The seven rechecks used new observation times and pins and do not form a post-fix 39-case cohort. In a separate earlier four-proposal pilot, three verified and one reported the same status difference. Indexed and contract vote counts agreed in those four snapshots. [Original records](springer/reconciliation.jsonl) · [Configuration](springer/reconciliation_config.json) · [Post-fix records](springer_followup/reconciliation.jsonl) · [Runtime evidence](springer_followup/deployment_checks.jsonl) · [Cohort figure](springer/reconciliation.svg) · [Earlier four-proposal results](raw_results/live-verification.json)

**Unresolved assignment discrepancy.** Current SQL held 10 active rows for 10 distinct members. The pinned contract at block 20277566 counted 9. The full creation-to-pin scan covered 931 ranges and found nine assignments and zero unassignments. Direct membership checks and event reconstruction agree with the contract. The extra SQL row lacks canonical assignment evidence and points to an `assignMembers` transaction that reverted at block 19347983 with receipt status `0x0` and zero logs. SQL labels that transaction `CONFIRMED`. An isolated mocked-receipt reproduction showed that the gateway and assignment use case can produce this state by accepting a failed receipt. The exact historical writer and SQL state at the pinned block remain unresolved. The evidence supports a cross-store inconsistency. It does not establish a blockchain fault. Production data and chain records were preserved. [Pinned history](springer_history/assignment_history.json) · [Receipt](springer_history/failed_assignment_receipt.json) · [SQL and write-path analysis](failure_diagnosis/ASSIGNMENT_WRITE_PATH.md) · [Isolated reproduction](failure_diagnosis/assignment_path_reproduction.json)

| Controlled pre-alias fixture group | Observed result |
|---|---|
| Four injected faults | Altered vote total, actual status divergence, stored event absent from a complete RPC scan, and simulated block-hash change detected under the stated oracle |
| Two no-fault controls | Clean control verified. Coherent finalization was the single false positive. |
| Two incomplete-index cases | Individual chain-only event rows unverified, aggregate result mismatched. The stale-checkpoint case lacked a checkpoint-specific diagnosis. |
| One RPC outage | Unavailable |
| One affected post-alias fixture, measured separately | The coherent-finalization control verified |

The six classifiable original cases yielded **4 TP, 1 FP, 0 FN, 1 TN**. The outage and incomplete-index cases sit outside the confusion matrix. The nine original fixtures ran once each with in-memory inputs. Median local execution was 2.316 ms, range 0.096–12.472 ms. Only the false-positive control was retested. No revised cohort confusion matrix or population fault-detection rate is reported. [Original fixtures](springer/fault_injection.json) · [Targeted retest](springer_followup/fault_injection.json)

## Authorization and read-only boundaries

| Protocol | Observed outcome | Scope |
|---|---|---|
| Historical live negative HTTP probes | 6/6 expected statuses | Missing or forged wallet/operator authorization, and DAO mismatch |
| Historical wallet authentication probes | 5/5 expected statuses | Ephemeral authentication signatures, including challenge, valid login, replay, wrong signer and signed-in nonmember denial |
| Paired DTO/authorization checks | 3/3 expected statuses | Malformed plural `questions` returned 400. Valid singular `question` with absent or invalid credentials returned 401 with no governance payload in the saved error bodies. Upstream invocation was unmeasured. |
| Isolated tool enforcement probes | 4/4 expected denials | Unregistered write and SQL tools, cross-role chain access and missing operator authorization |
| Historical broader test suites | Python 243 passed. Nest 65 passed and 3 skipped. Ganache 4 passed. | Includes non-security coverage. Separate from closeout regressions. |

The evaluated AI read paths and tool restrictions support the advisory/authority separation claim within tested boundaries. These observations do not establish comprehensive nondisclosure, resistance to free-text prompt injection, or formal smart-contract security. [Live probes and suite records](raw_results/) · [Wallet records](raw_results/wallet-probes.json) · [DTO responses](benchmark_200/versions/claude_adjudicated_v3/evidence/authorization_reconciliation.json) · [Tool denials](springer/security_probes.json)

## Exploratory B1–B4 comparisons

B1 is an LLM without retrieval. B2 is one agent with scoped tool access. B3 runs full orchestration with reference, currency and numeric blocking disabled in the research process. B4 keeps those checks active. The following experiments use different questions or versions and remain separate.

| Variant | Earlier count proxy hits, out of 8 | Frozen 0.6B correct, out of 8 | Frozen incorrect | Frozen unanswered | Frozen median wall (s) | Frozen valid recognized IDs |
|---|---:|---:|---:|---:|---:|---:|
| B1 | 0/8 | 2/8 | 2 | 4 | 0.616 | — |
| B2 | 2/8 | 2/8 | 2 | 4 | 1.474 | — |
| B3 | 8/8 | 0/8 | 3 | 5 | 3.843 | 16/16 |
| B4 | 8/8 | 1/8 | 2 | 5 | 3.629 | 17/17 |

The count-proxy sample used eight questions across four proposals. Mixed-certainty wording occurred in three B3 and four B4 answers. Earlier benchmark smoke retained 16 initial and four follow-up records. Four title attempts were excluded across variants because the model-visible scope leaked the gold title. On the three eligible saved B2 questions, 0/3 matched and final content extraction agreed with the provider output. These diagnostic results remain separate from the count proxy and frozen comparison. [Count-proxy data](springer/baseline_comparison_exploratory.csv) · [Benchmark smoke diagnosis](benchmark_200/CONTINUATION_RESULTS.md)

The frozen comparison retained 50 attempts. Eighteen initial attempts were harness-invalid, with 16 attributed to a pool interface mismatch and two direct recorder/dataclass errors. Fourteen initial observations plus 18 affected retries formed the 32 usable records. Each variant had eight purposive questions over two proposals. The shared SQL snapshot fingerprints and chain replay bytes match. Whole-answer judgments were post-hoc AI-assisted ratings. Both B1 and B2 scored their two correct answers on bounded unknowns. B4's one correct answer used a cited fallback. Among 16 full-workflow observations, eight had routing coverage failures and eight failed synthesis framing, with overlap. Retrieval operations completed in all 16. This measures execution success, not retrieval recall. Different generation settings, prompt protocols, cache state and retry opportunities constrain comparisons. [Initial records](exploratory_frozen_v1/responses.jsonl) · [Affected retests](exploratory_frozen_v2/responses.jsonl) · [Ratings and metrics](exploratory_frozen_v2/summary.json) · [Failure taxonomy](failure_diagnosis/FAILURE_ANALYSIS.md)

| Matched-decoding 4B development smoke | Attempts | Reported completed | Fallbacks | Median wall (s) | Chat input/output tokens, summed |
|---|---:|---:|---:|---:|---:|
| B1 | 2 | 2 | 0 | 9.51 | 366 / 204 |
| B2 | 2 | 1 | 0 | 74.65 | 22,867 / 942 |
| B3 | 2 | 2 | 0 | 50.08 | 5,448 / 846 |
| B4 | 2 | 2 | 1 | 75.06 | 5,448 / 868 |

The eight 4B trials and one separate B2 retest used two development questions drawn from already exposed facts. The 26 chat requests used matched effective decoding and all returned HTTP 200. Prompts and actual call counts still varied by architecture. The original B2 tool-loop failure remains in the table. The corrected research-only candidate passed one actual same-DAO comparison and one wrong-DAO denial. Its separate retest produced a final response with structured tool-error feedback but omitted the requested PDF allocation. An identical planner request yielded different outputs in one of two paired comparisons despite fixed options. Three setup failures occurred before inference and are kept outside the nine model observations. No human correctness, causal ranking or population inference follows. [Smoke records and metrics](harness_validation_v1/smoke_metrics.csv) · [Candidate retest](harness_validation_v1/candidate_v3_validation.json) · [Readiness](harness_validation_v1/BENCHMARK_READINESS.md)

## Pending evaluations and benchmark preparation

| Review stage | Exact count |
|---|---:|
| Original source checks | 175/200 source-checked, 25 quarantined |
| Claude audit of originals and replacements | 226 decisions, comprising 155 accept, 15 revise and 56 reject |
| Revision status | 14 pending adjudication, one superseded by a separately accepted replacement |
| Exposure filter on accepted items | 14 exposed removed, leaving 141 content-eligible under the LLM audit |
| Snapshot-dependent accepted questions | 21/21 rechecked against current SQL and pinned chain evidence. Historical SQL alignment remains unverified. |
| Reserve after the eight-question frozen comparison | 133, unchanged through the development smoke |
| Human-adjudicated questions | 0 |

The 141-item audit cohort had 28 DB, 37 PDF, 29 multi-source, 28 complex and 19 bounded-unknown items. It had no accepted unauthorized-access cohort. Claude provided independent LLM review. Human adjudication, frozen evidence for the remaining cohort and confirmatory accuracy remain pending. The 200-question confirmatory campaign did not run. [Versioned audit and gold provenance](benchmark_200/versions/claude_adjudicated_v3/BENCHMARK_READINESS.md) · [Exposure ledger](exploratory_frozen_v2/exposure_ledger.json) · [Latest readiness decision](harness_validation_v1/READINESS_DECISION.json)

## Evidence-to-claim map

| Manuscript claim | Status and evidence |
|---|---|
| CyberDAO routes governance requests to scoped specialists and composes cited answers | Verified implementation and tested fixtures. Pilot results establish selected gold-fact coverage and identify observable failures. See the pilot and workflow rows above. |
| Citation checking improves structural traceability | Verified structural behavior in selected fixtures, including the closeout marker regression. Claim entailment and semantic repair remain unestablished. See the citation table. |
| Read-only reconciliation can surface observable DB/chain disagreement | Verified on the archived cohort and pinned assignment investigation. Detection generalization and historical SQL writer attribution remain pending. See the reconciliation table. |
| Governance access checks deny the tested requests | Verified for the recorded scopes and fixtures. Comprehensive security and formal verification remain outside the evidence. See the authorization table. |
| Full orchestration improves whole-answer accuracy | Exploratory results are insufficient for a causal or confirmatory claim. See the separate pilot and B1–B4 tables. |
| A validated 200-question benchmark establishes final accuracy | Pending. Human-adjudicated count is zero and the full evaluation is unexecuted. |

The reproducibility manifest records both Git base revisions, working-tree source hashes and byte hashes of the archived scripts, configurations, data, outputs and figures. Historical regimes remain identified by their own manifests. See the recorded commands for reproduction and preserve the version boundaries when citing results. [Reproducibility manifest](FINAL_REPRODUCIBILITY_MANIFEST.json) · [Original methods](reports/METHODOLOGY.md) · [Original reproduction commands](experiments/REPRODUCE.md) · [Reconciliation reproduction](springer/REPRODUCE.md)
