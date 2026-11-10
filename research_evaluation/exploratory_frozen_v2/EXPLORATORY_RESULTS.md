# Historical assignment investigation and frozen-evidence exploratory comparison

## New reconciliation finding

The complete creation-to-pin membership scan covered 931 ranges from block 19347494 through the saved block 20277566. It returned nine MemberAssigned events and zero MemberUnassigned events. Reconstructing the assigned set gave nine members, agreeing with the pinned contract counter. One active SQL row had no matching canonical membership event, no latest evidence link, and a false contract membership flag.

That row's transaction reference resolves to a canonical **failed assignMembers call**, with receipt status 0x0 at block 19347983 and zero receipt logs. Decoding the transaction confirms the configured contract, proposal 32 and the SQL-listed member in its argument list. Thus the extra SQL row points to an assignment attempt that reverted. The SQL active flag includes an operational row without a successful canonical assignment, while the contract counts successful assignments. The difference is an unconfirmed or inconsistent canonical projection for that row. The application/import path and whether it intentionally preserved assignment intent remain unresolved. No unassignment event explains a stale removal, and duplicate SQL rows do not explain the count. Historical SQL row versions and indexer checkpoints remain unavailable. This is not evidence of a blockchain fault.

The prior FINALIZED-to-Closed fix and its passing regression remain preserved. The six recorded unverified cases are documented in `springer_history/unverified_winner_tie.csv`: each lacks SQL winning-option and tie values. Those absence records remain distinct from a detected false value. No governance records were changed to force agreement.

## Exploratory comparison and exact denominators

Eight eligible questions were selected before generation, with two each from DB, PDF, multi-source and PDF-bounded unknown categories. They cover two demo proposals. The existing B1–B4 implementations were reused, with recorded provider options, fixed model digests and the corrected verifier hash. All SQL tools imported a shared read-only MVCC snapshot, including document-index state. The corrected verifier captured chain observations against that SQL snapshot, and tool-equipped variants replayed identical sanitized chain reports.

Chat and planning used **qwen3:0.6b**, with qwen3-embedding:0.6b embeddings. B1/B2 used seed 42, temperature 0.6, context 8192 and a 1536-token output cap. Existing planner and workflow retry limits remained in force and are recorded in provider calls. The comparison therefore includes unequal stage/retry budgets and only this small-model configuration.

There are **50 preserved raw attempts**. Eighteen initial attempts were invalidated by two research-harness defects: a missing pool timeout parameter and incorrect dataclass conversion. Fourteen unaffected records were retained. Only the 18 affected pairs were rerun after real-tool preflight checks. The resulting comparison has **32 records, eight per variant**. Full-table source fingerprints match between campaigns and the chain snapshot bytes are identical. Invalid attempts remain available with exclusion reasons and are not counted as model failures.

The following whole-answer assessments are **post-hoc AI-assisted judgments by the same research assistant**, with human adjudication pending. Safe declines on bounded unknowns count as correct; a technical fallback is unanswered. Citation grounding is scored separately. All selected outer requests completed, but eight final answers were technically unavailable. Nine final responses had mixed/fallback origins, including one useful correct budget answer.

| Variant | AI-rated correct | Incorrect | Unanswered | Median wall s | Structurally valid citation IDs |
|---|---:|---:|---:|---:|---:|
| B1 | 2/8 | 2 | 4 | 0.616 | — |
| B2 | 2/8 | 2 | 4 | 1.474 | — |
| B3 | 0/8 | 3 | 5 | 3.843 | 16/16 |
| B4 | 1/8 | 2 | 5 | 3.629 | 17/17 |

The two B1/B2 correct answers per variant are safe declines on bounded unknowns, not recovery of the requested positive governance facts. B4's one correct answer is a cited security-allocation fallback. Both full workflows mislabelled budget allocations in a multi-source answer and failed to return requested governance counts. These observations cannot establish a general model ranking. Planner/retry budgets differ across baseline implementations, and cache state and campaign times were uncontrolled.

The purposive diagnostic claim sample contains **18 assertions**: ten supported, four contradicted and four unsupported by returned evidence. The eight bad assertions are contradicted by authoritative source values. Four are local UUIDs substituted for numeric on-chain IDs; four swap budget labels despite valid source identifiers and amounts. This sample is intentionally diagnostic, not an exhaustive or random claim sample. No population support-rate estimate is justified. All written B3/B4 reference IDs resolve, yet this does not ensure semantic support. Source-linked annotations and automatic numeric/reference checks are saved separately.

All four B1/B2 bounded-unknown responses declined to invent the missing value. B3/B4 instead returned four technical-unavailability fallbacks on those cases. Answerable cases with false abstention are recorded individually. Appropriate abstention, factual correctness, technical failure and citation grounding must remain separate metrics.

Inference is limited by eight purposive cases, two related source clusters, one observation per pair and same-assistant scoring. No confirmatory p-values or population confidence intervals are reported. Human-validated whole-answer correctness and claim entailment remain pending.

## Exposure and next gates

The original 141-question v3 files are preserved. These eight questions are now exposed, including the invalid initial attempts. The updated ledger leaves **133 reserved questions**. A subsequent confirmatory campaign must apply this ledger, freeze its evidence, adjudicate the scoring and review outstanding revisions. No confirmatory or human-validated result is asserted here.

The failed assignment reference provides a concrete target for a separate write-path investigation. Reproducing the historical SQL insertion would require audit logs or an isolated replay of the relevant application/import path. The known status fix remains the only production logic modification.
