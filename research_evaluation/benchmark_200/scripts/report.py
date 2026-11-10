"""Generate the results report solely from preserved validation and run metrics."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    s=json.loads((ROOT/'metrics/summary.json').read_text(encoding='utf8'))
    table=[]
    for v,r in s.items():
        refs=f'{r["valid_reference_ids"]}/{r["reference_ids"]}' if r['reference_ids'] else '—'
        table.append(f'| {v} | {r["proxy_hits"]}/{r["answer_cases"]} | {r["median_wall_ms"]/1000:.3f} | {r["median_observed_all_chat_input_tokens"]} / {r["median_observed_all_chat_output_tokens"]} | {refs} | {r["fallback_or_mixed_cases"]} |')
    text='''# CyberDAO 200-question benchmark construction and smoke results

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
'''+ '\n'.join(table)+'''

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
'''
    continuation=ROOT/'CONTINUATION_RESULTS.md'
    if continuation.exists():
        text='# CyberDAO benchmark audit and experimental results\n\n'+continuation.read_text(encoding='utf8')+'\n\n---\n\n## Preserved original development-smoke account\n\n'+text.split('\n',1)[1]
    (ROOT/'FINAL_REPORT.md').write_text(text,encoding='utf8')

if __name__=='__main__':main()
