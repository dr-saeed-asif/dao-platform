# CyberDAO benchmark audit and experimental results

## Continuation results and current validation status

The frozen 200-question benchmark and all previous smoke responses remain unchanged. **175 items passed the available value/anchor source checks; zero items have independent ground-truth adjudication.** This does not mean 175 clean benchmark questions: semantic wording, duplication and leakage require separate decisions. The original 25 absence questions remain quarantined. An unreleased 200-item draft substitutes 25 narrower, quote-anchored candidates and one newly identified leaking title question for external review; it is not used as validated gold.

### Review of all 200 original items

- Every quarantined item now has a specific record in [quarantine_25.json](review/quarantine_25.json), including its requested fact, original expectation and relevant source boundaries. None was rejected by an independent reviewer: no independent review existed. Its original exact-phrase absence test was insufficient. A lack of a value in the limited export cannot establish that it is universally unknown or absent from other authoritative records.
- [item_source_audit.json](review/item_source_audit.json) checks all 175 source-checked items. Direct SQL fields, quoted PDF anchors and recomputed operands match saved expectations. This is an automated same-assistant source audit, not semantic approval. The authorization checks establish saved 401 statuses; they do not independently establish response-body non-disclosure or upstream non-invocation.
- Ten multi-source wordings combine a stored proposal identifier and a chain option count ambiguously. All 292 high-overlap lexical pairs are flagged for semantic review rather than automatically accepted or called duplicates. Many source facts are reused. Complexity/difficulty labels and the predominance of arithmetic need construct review.
- The current-context literal audit identifies **DB-021**: its expected title is identical to the DAO identifier given to the baseline. It has not been executed in these campaigns. A separate [replacement proposal](review/replacement_leaked_title.json) asks for a timestamp-derived database voting-window duration. It is used only in the unreleased reviewer draft. Other literal full-answer checks do not establish absence of semantic leakage.
- [replacement_candidates_25.json](review/replacement_candidates_25.json) contains exact negative-evidence quotes and PDF page/hash references. These narrow questions to what the PDF establishes. Some reject false premises, so category validity also requires adjudication. They were not silently admitted or sent to a model.
- [EXTERNAL_REVIEW.md](review/EXTERNAL_REVIEW.md) describes two-stage blind derivation and adjudication. A 200-item [blind sheet](review/blind_review_sheet.csv), a 226-row historical/proposed adjudication sheet and separate proposed questions/gold are ready. No reviewer IDs, agreement scores or approval decisions have been invented.

### B2 diagnosis from existing saved trials

The three eligible old B2 answers exactly match their final provider content, so no extraction loss explains 0/3. All 22 existing tools were exposed. Successful document-metadata, governance and chain reads show that access was available. No recorded permission-guard rejection explains the score. Seed 42, temperature 0.6, context 8192 and output cap 1536 were actually supplied. These observations do not establish that model size or tool-list length caused the errors.

The PDF question made no tool call and incorrectly asserted that PDF retrieval was unavailable. The multi-source question fabricated an evidence identifier, omitted the required `chunk_key`, and then answered without searching PDF evidence. The status question chose vote facts rather than the proposal/status tool and invented a raw status. The model did not invoke `search_proposal_evidence` in any of the three. [b2_diagnosis.json](review/b2_diagnosis.json) includes exact schemas, tool events and option records. No old result was changed and no smoke trial was repeated.

All four excluded title attempts have been [audited](review/excluded_attempts.json). Their original model-visible scope label contained the exact gold title. The exclusion applies to every variant, including failed/fallback/incorrect and matching answers, irrespective of outcome. It was identified after execution, is explicitly documented as such, and all raw rows remain saved. Other wrong answers remain in their denominators.

### New experiment permitted under the validation restriction

Eight previously unrun direct-record questions were selected before new generation: indexed vote count and active assignment count for each of the four captured proposals. This selection uses unambiguous integer source fields, without the multi-source or unanswerable cases. Pre/post read-only SQL checks confirm that these count fields match the frozen snapshot. This is a **nonconfirmatory source-checked diagnostic subset, not an independently validated benchmark**. There were 32 new attempts, eight per variant, with unique IDs and resumable checkpoints. All completed, with real model/provider responses preserved; there were no new outer failures or fallback-labelled final answers. Prior smoke and new subset results are not pooled as one accuracy estimate.

This deliberately narrow count subset is easier than the full category mix and cannot substitute for it. The expected source counts and selected IDs were fixed before generation; the lexical scorer and wording diagnostics were implemented after inspecting saved responses. The analysis is exploratory and not preregistered. Incorrect, off-target and internally mixed responses remain in their denominators.

| Variant | Requested-count proxy hits | Mixed-certainty wording flags | Median wall s | Valid reference IDs | Median all-chat input/output tokens |
|---|---:|---:|---:|---:|---:|
| B1 | 0/8 | 0 | 0.462 | — | 118.5 / 16.0 |
| B2 | 2/8 | 0 | 0.838 | — | 1380.0 / 44.0 |
| B3 | 8/8 | 3 | 2.618 | 8/8 | 1527.5 / 134.0 |
| B4 | 8/8 | 4 | 2.758 | 9/9 | 1572.0 / 137.5 |

The proxy detects the requested numeric count in context. It is **not whole-answer accuracy or claim support**. In B3/B4, three zero-vote answers also begin with “The available evidence does not establish that,” despite reporting the known database zero. B4 additionally splits the training scope marker into an extra question and includes an unrelated abstention. The automatic mixed-certainty flags are diagnostics, not independently adjudicated contradictions. One of B2's two matching counts has no returned source, illustrating the difference between a correct-looking number and verified grounding. Valid citation IDs do not resolve these answer-quality problems.

Four of the eight expected counts are zero; this narrow source pool has an imbalanced answer distribution. B1's low count coverage does not by itself make its uncertainty statements incorrect or unsafe. Returned-record accuracy, grounding, appropriate uncertainty and completeness need separate semantic ratings.

Automatic claim flags, retrieved excerpts, provider token counts, warnings and unsuccessful tool events remain in [subset_scores.json](metrics/subset_scores.json) and the [32 raw records](raw_results/source-counts-v1/responses.jsonl). Claim entailment, unauthorized response-body disclosure and semantic abstention correctness remain unmeasured by independent reviewers. These eight questions are answerable: abstention-wording counts are not unanswerable-case accuracy.

### Denominators and uncertainty

There are **52 saved attempts overall**: 20 historical smoke attempts (four contaminated exclusions) plus 32 new subset attempts. That leaves 44 eligible answer attempts across the two separate development studies, plus four historical HTTP denial attempts. The new subset denominator is 8 per variant; the old factual smoke denominator remains 3 per variant. There are still zero full-200 campaign outputs. The four historical HTTP denials involve no model and are not included in answer accuracy.

The eligible new subset contains two related questions per proposal. The following 95% intervals are **exploratory conditional proposal-cluster bootstrap resampling intervals** for the numeric proxy, not population or stochastic-generation confidence intervals. They resample the four observed proposal clusters 5,000 times, seed 42, averaging both questions within each cluster. With only four purposively selected sources, intervals can be unstable or degenerate; [subset_summary.json](metrics/subset_summary.json) leaves inferential population accuracy intervals null.

| Variant | Conditional cluster resampling interval |
|---|---:|
| B1 | 0.0–0.0% |
| B2 | 0.0–75.0% |
| B3 | 100.0–100.0% |
| B4 | 100.0–100.0% |

Paired comparisons retain all eight matching IDs. B4-only count matches are 8 versus B1, 6 versus B2 and 0 versus B3. [subset_paired.json](metrics/subset_paired.json) contains conditional cluster intervals for matched proxy and latency differences. No significance p-values are reported. No independent whole-answer or semantic claim-support rate is reported. Equal numeric coverage by B3/B4 does not demonstrate the benefit or lack of benefit of citation verification.

### Current blockers and saved outputs

Full 200 × 4 evaluation remains blocked by independent semantic gold validation, ambiguity/deduplication adjudication and category/holdout approval. It is not blocked or censored merely because model answers are wrong. The draft replacement version is prepared for reviewers; blank review fields never count as acceptance. The original sources still cover only four demo proposals, with overlap in earlier studies. Production functionality has not been changed.

The new [CSV table](tables/source_counts_subset.csv), [figure](figures/source_counts_subset.svg), reviewer pack, configuration, provider traces and bootstrap calculations are reproducible from saved data. The exact selected IDs and the no-independent-review label are in [eligible_subset.json](review/eligible_subset.json). The previous final report and provenance manifest are archived. No complete 200-question journal claim is justified by this continuation.


---

## Preserved original development-smoke account


## Status and evidence boundary

**The 200-question evaluation is blocked and has not been completed.** There are 200 unique candidate texts and declared target signatures, with the requested 40/40/40/30/25/25 category allocation. Only **175 machine/source-checked items** are in `questions_verified.json`; the 25 unanswerable candidates remain quarantined. Phrase absence cannot establish semantic unanswerability. Independent human verification and semantic near-duplicate review are unavailable. No unverified absence candidate has entered the released subset or accuracy denominator.

The four model variants completed a smoke campaign. A contaminated title question is excluded. Three uncontaminated factual smoke questions and one common authorization case were tested across all four variants. The multi-source request failed requested-fact coverage for every variant, even when the workflow returned a completed status. This incorrect response is a retained experimental outcome, not an accuracy-based exclusion rule. The full run is blocked by unresolved benchmark ground-truth validation; poor model accuracy alone would not justify withholding an otherwise valid full evaluation.

| Work | Outcome |
|---|---|
| Fresh evidence capture | Four demo database/chain scopes, two original PDFs, read-only SQL |
| Independent source checks | Aggregate SQL cross-checks; PDF text anchors; direct eth_call verified 10 proposal fields and pinned block hash for each of four proposals |
| Candidate construction | 200; exact text and declared target uniqueness checked; independent semantic duplication review pending |
| Source-checked subset | 175; 25 absence candidates quarantined |
| Smoke observations | 20 total; 4 contaminated title attempts excluded; 12 eligible answer attempts plus 4 real HTTP denials |
| Full 200 × 4 comparison | Blocked before execution; zero full-phase results |
| Independent human assessment | Not performed; assistant diagnostic annotations are separate |
| Concurrency, repeated seeds and cost | Not attempted; electricity and billing instrumentation unavailable |

## Benchmark and provenance

`questions.json` contains all candidates. `ground_truth.json` contains expected facts or denial/abstention behavior, source identifiers, snapshot digest, verification status and reviewer status. These files are separate. The runner does not read gold. `questions_verified.json` is the provisional source-checked subset. `quality.json` records quarantine and eligibility.

The benchmark uses four existing synthetic demonstration proposals and two source PDFs, with reference to the original PDF bytes under `../datasets/source_documents/`. Database fields are independently checked against aggregate SQL. PDF answers are anchored to extracted source text; arithmetic uses source operands. Multi-source targets combine a document allocation, a database observation and a chain observation. The complex category currently measures exact compound calculations and evidence-boundary reasoning; it is not a validated benchmark of open-ended policy deliberation or causal risk prediction. The authorization category has 25 distinct requests through the same unauthenticated route, not 25 independent authorization mechanisms.

Question formulations are new relative to the earlier pilot. The underlying demo sources and some atomic facts overlap it, so this is **not an independently sampled held-out source population**. Smoke-used items are development items and must be excluded from later confirmatory evaluation. Before a final release, review semantic overlap of combinations and annotate unsupported or ambiguous wording independently. Verification labels are computational source checks, not independent human approvals.

The model-comparison smoke uses the pilot proposal only. Blockchain tools in B2/B3/B4 replay the same captured real backend projection, including the pinned block hash. This is evidence replay, not a fresh blockchain read for every answer or a synthetic model mock. Separate direct eth_call checks confirmed all 40 captured proposal fields and all four block hashes. Database and indexed-PDF tools run against real read-only infrastructure. A post-smoke SQL check found no field drift after correcting a Windows decoding error. The vector index was not transactionally frozen; retrieved source excerpts are retained per run.

## Variant implementation and settings

- B1 uses a real LLM with no tools or retrieved records.
- B2 uses one real LLM with all 22 existing tool definitions, six model turns at most, and an outer DAO/proposal argument guard. Tool choice is model-driven. This adapter is a research harness, not an existing production single-agent baseline.
- B3 uses the existing planner and LangGraph workflow, with reference/currency and numeric-blocking gates disabled only by process-local patches. Worker and synthesis gate imports are patched. Source-ID canonicalization and task-coverage checks remain. This is broader than the earlier pilot's worker-only ablation.
- B4 uses the existing planner, specialists and synthesis with production verification gates.

All answer models use `qwen3:0.6b`; embeddings use `qwen3-embedding:0.6b`. Actual provider responses, model names, digests, generation options and token counts are retained. Single-agent answer settings are seed 42, temperature 0.6, context 8192 and output cap 1536. Application writing uses its existing 1536/3072 retry caps; the semantic planner uses temperature 0 and its own 3072 cap. Thus this is not a perfectly equal-inference-budget architecture comparison. Serial execution uses the same Windows host and Ollama service, with a 200-second outer attempt timeout. Cache state is uncontrolled. Provider instrumentation includes planning calls in observed chat token sums. Embedding tokens, retrieval spans and complete provider attempts remain in raw data; no invoice or energy cost is inferred.

Authorization items share the real Nest missing-wallet boundary before any model call. They are logged as `real_http_authorization_gate_no_model`. They cannot measure model prompt-injection resistance. Status codes alone do not establish absence of sensitive response content; response-body disclosure review was not captured and disclosure rates remain unknown.

## Observed smoke results

| Variant | Requested-fact proxy hits | Median answer wall s | Median all-chat input/output tokens | Valid reference IDs | Mixed/fallback cases |
|---|---:|---:|---:|---:|---:|
| B1 | 0/3 | 0.486 | 120 / 22 | — | 0 |
| B2 | 0/3 | 1.403 | 3042 / 91 | — | 0 |
| B3 | 2/3 | 2.768 | 1484 / 128 | 3/3 | 1 |
| B4 | 2/3 | 2.334 | 1484 / 129 | 3/3 | 1 |

Each row has three eligible factual questions. The lexical proxy checks a stored status, a PDF budget and explicit requested numbers for a multi-source answer. It is not complete answer accuracy, claim entailment or human-reviewed correctness. Both B3 and B4 have one off-target fallback among these three questions. Their budget and status answers match the requested facts. Their multi-source answer reports only one DAO proposal, omitting the requested budget and database/chain membership. Neither B1 nor B2 recovers the required facts on the three eligible cases.

There were no transport/outer-workflow failures among the 12 eligible answer attempts, but all four variants failed requested-fact coverage on the multi-source case. B2 attempted an invalid document-chunk call and subsequently produced a final answer; the failed tool event and provider responses are preserved. Four additional shared-boundary HTTP tests returned 401 with zero model calls. The 25 distinct authorization preflight requests also returned 401. These are narrow route checks, not evidence of comprehensive access isolation.

The source-ID check found 3/3 identifiers valid in each of B3 and B4, including a citation on the irrelevant DAO-count response. B1 and B2 had no final-answer reference denominator. This illustrates why valid citations do not establish requested-answer coverage or semantic support. Automatic numeric/reference claim flags are in `metrics/run_scores.json`. Selected diagnostic source comparisons in `metrics/assistant_claim_review.csv` are unblinded assistant annotations, not independent human ratings and not an exhaustive claim sample. No semantic support percentage is reported.

Preserved contradictions include B1's unsupported USD 500000 budget and 1000 assignments, B2's raw-status answer `pilot proposal`, and B2's statement that the pilot starts in 2025 despite the chain timestamp indicating 2026. B2 also denied that the available functions can access PDF content despite the exposed retrieval/chunk tools. B3/B4's supported but irrelevant DAO count is separately labeled off-target. Known contradictions and unsuccessful outputs were not removed or repaired in the raw records.

## Statistical interpretation

Only three purposive answer cases from one proposal remain eligible. They share sources and were used for development smoke testing. Population confidence intervals, inferential paired tests and model rankings are therefore withheld. `metrics/paired_descriptive.json` records matched-case discordances and mean latency differences with null p-values. B4-only hit counts are two versus B1, two versus B2 and zero versus B3. There is no evidence here that removing citation verification changes answer accuracy or that a 200-item target ensures significance.

An eventual study needs a predeclared outcome rubric, independently reviewed and adjudicated gold, sampled source populations, and a justified unit of analysis. Report abstention, disclosure, failure and unsupported-claim outcomes separately. Account for shared proposals, repeated facts and repeated model trials; use category-specific and paired estimates only when their assumptions hold. Do not treat the 25 requests to one authorization boundary as 25 independent security controls.

## Validation corrections and preserved history

The initial DB-title question disclosed the exact answer in a scope label. All four resulting attempts remain in `raw_results/smoke/responses.jsonl`, are explicitly ineligible, and have no influence on the reported comparison. Current questions use neutral scope labels. A different factual question was smoke-tested without rerunning any completed question. Archived launch datasets and scripts authenticate against the original campaign hashes. A testing-proposal ID that encodes its on-chain ID was also removed as a target for the released dataset; that item now asks the cached vote total.

The first capture attempt failed before observation because a transaction isolation statement was issued inside a subtransaction. A setup auth probe used the wrong DTO key and returned 400; it is retained inside the snapshot and is not counted as an authorization denial. Corrected valid DTO preflight checks returned 401. An apparent training-title drift came from UTF-8 text read with a Windows default encoding; the failed check is archived and the corrected check shows zero drift. A capture digest originally described LF serialization rather than Windows-written file bytes; its original is archived and the sidecar now hashes exact saved bytes. These were harness corrections; production code and measured response text were preserved.

## Blockers and next evidence

1. Independently verify and adjudicate the 25 bounded-absence questions, and review all category wording and semantic near-duplicates. Keep unverified items quarantined. Source-checked questions alone do not satisfy independent semantic gold validation.
2. Preserve the failed multi-source planning/coverage outcome in the evaluation. Any separately authorized implementation change requires a new frozen revision and a separate campaign; fixing an incorrect answer is not a prerequisite for evaluating the unchanged system and must not erase its failures.
3. Use new held-out questions after development; obtain more independent DAOs/documents. Freeze SQL/index state or execute against an isolated snapshot so later campaigns share evidence.
4. Collect independent claim-to-evidence annotations, response-body disclosure assessments and unanswerable-case outputs. Obtain repeated stochastic runs, category sample-size justification and hardware/cache control before inferential comparisons.
5. Run the full resumable comparison only after the documented quality gate is genuinely ready. The current runner refuses it. No resource limitation is being used to hide an incomplete successful 200-question run.

## Reproducibility and artifact map

See [README](README.md), [quality record](quality.json), [validation](metrics/validation.json), [CSV table](tables/smoke_comparison.csv), [vector figure](figures/smoke_coverage.svg), [raw smoke](raw_results/smoke/responses.jsonl) and [new factual smoke](raw_results/smoke-v2/responses.jsonl). `provenance.json` records exact file-byte hashes. Prior research_evaluation artifacts and production sources were not modified. This report is suitable as a transparent benchmark-development and smoke-test account; it does not constitute final 200-question journal results.
