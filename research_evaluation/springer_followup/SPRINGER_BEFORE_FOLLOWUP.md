# CyberDAO experimental results for the Springer manuscript

## Benchmark validation

The [v3 readiness report](benchmark_200/versions/claude_adjudicated_v3/BENCHMARK_READINESS.md) applies the supplied Claude audit to 226 records. It retains 155 accepted items, excludes 56 rejected records, and documents all 15 requested revisions. One revision is covered by the separately accepted replacement. The remaining 14 await adjudication. Removing 14 previously exposed accepted items leaves **141 content-eligible questions under the independent LLM review policy**. The human-adjudicated count is zero. The eligible categories contain 28 DB, 37 PDF, 29 multi-source, 28 complex and 19 PDF-bounded unanswerable items. The authorization cohort is empty.

All 21 accepted snapshot-dependent items passed the saved current SQL and pinned chain source checks. The historical database state at those blocks remains unverified. The authorization discrepancy was reproduced with paired request shapes. The malformed plural key yielded HTTP 400 with DTO validation errors. A valid singular key yielded HTTP 401 with a wallet sign-in error for absent and invalid credentials. The saved bodies showed no governance payload for these two requests. Upstream invocation was unmeasured. [Source checks and response bodies](benchmark_200/versions/claude_adjudicated_v3/evidence)

The confirmatory B1–B4 campaign remains gated. It needs an approved question cohort and scoring rubric, aligned or frozen evidence across variants, and adjudication appropriate to the manuscript’s accuracy claims. The available 141 items leave a 59-item shortfall for the intended 200, with a missing authorization category. The larger source inventory offers 36 additional proposal records and one additional hash-verified PDF original for review.

## Verifier version and reconciliation

Git commit `a967659` on November 8 introduced active-assignment comparison and distinguished chain-only events from stored events outside the scanned range. A fresh API build from `d9df7eb` was loaded into an isolated loopback Nest instance with the actual verifier and controller. It used a read-only PostgreSQL connection and the configured chain RPC. The deployed HTTP response returned the new assignment-count comparison, and the build and source digests were recorded before cohort expansion. This deployment evidence covers the research instance. [Build and runtime evidence](springer/deployment_checks.jsonl)

The cohort contained 39 of 40 observed database records, selected by non-null on-chain ID and matching configured network and contract. The earlier 39-item roster was unavailable, so membership equivalence is unverified. Each request pinned its own block, yielding 27 distinct blocks. SQL was read-only and current. The cohort results describe verifier outcomes without assuming temporal alignment of indexer state and contract state.

| Outcome | Proposals |
|---|---:|
| Verified | 23/39 |
| Mismatched | 7/39 |
| Unverified | 9/39 |
| Unavailable | 0/39 |

All 39 requests returned HTTP 200 and the verifier reported zero RPC errors. Median HTTP wall time was **3.858 s**, with a **1.792–5.716 s** range at concurrency two. Six mismatch reports contained a database `FINALIZED` versus contract `Closed` comparison. A controlled fixture reproduced this mapping discrepancy when both sources agreed that finalization had occurred. The remaining mismatch reported **10 active assignments in SQL versus 9 on-chain**. This establishes disagreement at the observations used by the verifier. Its cause remains unresolved. The nine unverified outcomes are kept separate from mismatches and infrastructure failures. [Records](springer/reconciliation.jsonl) · [Table](springer/reconciliation_table.csv) · [Figure](springer/reconciliation.svg)

## Controlled fault injection

Nine fixtures exercised the same built verifier with in-memory DB and RPC responses. Latency is local fixture execution, with median **2.316 ms** and range **0.096–12.472 ms**. These fixtures have one observation per case.

| Fixture | Observed behavior |
|---|---|
| Clean input | Verified |
| Altered stored vote total | Vote-total mismatch |
| Stored active status against closed contract state | Voting-status mismatch |
| Stored event absent from a complete RPC scan | Event mismatch |
| Block hash changes between initial and final reads | Reorganization warning and verification withdrawn |
| Coherent finalization with `FINALIZED` and `Closed` | False status mismatch under the fixture oracle |
| Chain event absent from index, checkpoint unknown | Event row unverified, overall report mismatched |
| Chain event absent from index, stale checkpoint fixture | Event row unverified, overall report mismatched, no checkpoint-specific diagnosis |
| RPC outage | Unavailable |

The six classifiable cases gave **4 true positives, 0 false negatives, 1 false positive and 1 true negative**. A reorganization warning with withdrawn verification is a detection under this oracle. The two index completeness cases and the outage are outside this confusion matrix. Both index completeness cases demonstrate different behavior at the event and report levels. The stale checkpoint fixture documents the absence of checkpoint-aware diagnosis. No fault-detection rate for deployed systems can be estimated from these selected fixtures. [Fixture configuration, results and timings](springer/fault_injection.json)

## Citation and authorization

The saved citation challenge classified all eight structural reference cases as expected, including deliberately invalid IDs. A valid source ID also passed for a wrong-field number when the number was present elsewhere in the source. A false cancellation claim and a contradictory statement that a known zero tally was unavailable were left unchecked semantically. The earlier unblinded pilot review found 15 supported assertions and one contradiction among 16 reviewed assertions. Structural validity, automatic claim checks and semantic support are separate measurements. [Citation challenge](raw_results/citation-challenge.json) · [Claim annotations](analysis/first-pass-claim-review.csv)

Four new isolated tool requests were denied as expected. The requests attempted an unregistered transaction tool, an unregistered SQL tool, a cross-role blockchain read and a blockchain read without operator authorization. These simulated tool invocations test the enforcement layer after a hypothetical injection. Free-text attack success and comprehensive access isolation remain unmeasured. Earlier wallet and HTTP authorization observations remain separate. [Tool probe records](springer/security_probes.json)

## Prior exploratory B1–B4 evidence

The prior count subset remains descriptive. Eight questions from four proposals were evaluated per variant. The matched-count proxy gave **B1 0/8, B2 2/8, B3 8/8, B4 8/8**, with mixed-certainty wording in three B3 and four B4 answers. Whole-answer correctness and independently rated claim support remain unavailable. The earlier proposal-cluster resampling intervals describe this purposive subset. The reconciliation cohort and one-run fault fixtures use exact counts and descriptive latency without population confidence intervals.

B1 used a model without tools. B2 used one model with 22 registered tool definitions and a scope guard. B3 used the full orchestration with reference, currency and numeric blocking gates disabled in the research process. B4 retained those gates. Planner settings, retry budgets and routing differed by design, so these observations cannot isolate architectural effects. A future matched comparison should verify equivalent permitted evidence access, record actual tool usage, and freeze the shared evidence. The existing source-count comparison remains the exploratory baseline. [Table](springer/baseline_comparison_exploratory.csv) · [Original analysis](benchmark_200/CONTINUATION_RESULTS.md)

For the manuscript, use the reconciliation counts and latency, named fixture outcomes, and the measured distinction between reference validity and claim support. Keep the system comparison labelled exploratory. [Evidence-to-claim mapping](springer/EVIDENCE_TO_CLAIMS.md) · [Reproduction](springer/REPRODUCE.md)
