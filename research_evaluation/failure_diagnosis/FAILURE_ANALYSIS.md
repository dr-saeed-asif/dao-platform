# Exploratory failure diagnosis

This is a retrospective, AI-assisted analysis of preserved observations, not independent human adjudication. No model runs were added and no original scores or production behavior were changed. One new isolated assignment-path reproduction and read-only database inspections were performed. Counts below describe this selected sample only.

## Attempts and exclusions

The two campaigns retain 50 raw attempts. Eighteen initial attempts were harness-invalid. Their affected retries are separate observations, not replacements in the raw files. The usable matrix contains 32 observations, eight per variant, assembled from 14 original observations and 18 corrected-harness observations.

| Primary excluded-attempt cause | Attempts | Evidence strength |
|---|---:|---|
| FrozenPool connection adapter omitted the timeout argument | 16 | Source and preflight attribution. Some wrappers masked the underlying exception, so this is not 16 independently retained timeout stack traces. |
| Recorder called model_dump on a RunMetrics dataclass | 2 | Direct AttributeError in B3/B4 MS-026 tool execution. |

[Item-level exclusions with original file/line references](excluded_attempt_taxonomy.csv). Exclusions were technical harness defects, not exclusions for wrong model answers.

## Why B3/B4 performed poorly

The following counts use the 16 usable full-workflow observations. Categories overlap and must not be summed.

| Failure or diagnostic | Observations | Interpretation |
|---|---:|---|
| Routing or required-source coverage failure | 8/16 | DB-006, DB-016, MS-002 and MS-026 in both variants. |
| Missing required TASK q1 header | 8/16 | DB-016, PDF-026, UN-R001 and UN-R018 in both variants. Nonempty model output was rejected by the parser. |
| Citation gate rejected synthesis | 1/16 | B4 PDF-006 preserved the correct worker budget fallback. |
| Incorrect budget-label answer | 2/16 | B3/B4 MS-002, two contradicted claims each. |
| Off-target DAO proposal count | 2/16 | B3/B4 MS-026 returned a true count that did not answer the requested budget/vote question. |
| Retrieval operation error | 0/16 | Fourteen evidence searches and two DAO-count operations completed. This does not measure retrieval recall or relevance. |
| HTTP or empty-provider-output failure | 0/16 | Successful provider transport does not establish a successful user answer. |

All 16 worker results contained sources. No proposal/governance/blockchain evidence tool was called in these full-workflow cases. DB questions were routed to PDF evidence, MS-002 used document evidence without the other required sources, and MS-026 selected a research/count path. Role permissions existed but no recorded tool denial explains these routing misses. A semantic plan is authoritative in the current planner path, so default-agent resolution after an empty agent selection can constrain coverage.

Eight synthesis outputs omitted the required task header. The actual model returned useful content in some of these cases, including PDF-026's EUR 2,000 and bounded-unknown responses, but the parser rejected them and final responses fell back to placeholders. These are model/protocol compatibility failures, distinct from retrieval failure and from scoring the hidden provider text as if the user had received it. B3 PDF-006 separately discarded a correct budget worker answer in favor of an uncited abstention with verification disabled. B4 retained that worker answer after its active gate rejected the synthesis.

See [per-observation source and failure references](full_workflow_taxonomy.json), [provider settings](provider_options.json), and [citation analysis](CITATION_SUPPORT_ERRORS.md). The trace parser's synthesis-header check is at AI `app/business/agents/synthesis.py:177–179`; reference/currency checks are at lines 194–195. These refer to the locally inspected source, hashed in the diagnosis manifest.

## Configuration and scoring audit

B1 had no retrieval. B2 registered all 22 permitted tools with scope restrictions. B3 used full orchestration with citation/numeric blocking disabled. B4 retained those checks. The scope-restricted B2 tool inventory permits the relevant evidence reads. B3/B4 role allowlists can access them through their respective workers, but actual routing did not exercise them in the affected questions.

All recorded provider calls used qwen3:0.6b. Saved model digests, baseline entry-script hash, table fingerprints, corrected-verifier hashes and chain replay bytes agree across the original and affected-retest configurations. This supports evidence consistency within the frozen campaigns, not historical SQL reconstruction at a chain block.

Decoding and call budgets were not fully matched. B1/B2 used seed 42, temperature 0.6, context 8192 and output cap 1536. Full-workflow planners used temperature 0 and cap 3072 without an explicit seed. Their writer used seed 42, temperature 0.6, top_p 0.8, top_k 20, repeat_penalty 1.1 and cap 1536. B1/B2 omitted those additional sampling parameters, relying on provider defaults. Prompts, task-header requirements and numbers of inference opportunities also differed. Exact request options and original lines are retained in provider_options.json.

The original same-assistant post-hoc whole-answer counts remain B1 2/8, B2 2/8, B3 0/8 and B4 1/8. No deterministic score-aggregation error was found. B1/B2's two correct cases each were the bounded-unknown denials. On the six answerable questions each, counts were 0/6, 0/6, 0/6 and 1/6. These strata are descriptive, not a revised score. Whether individual abstention/fallback ratings should change requires blind independent adjudication, not relabeling to improve results. [Strata](answerability_strata.csv)

## Validity and justified next steps

This comparison is usable as an exploratory failure analysis, not as a controlled causal ranking of multi-agent architectures or a confirmatory accuracy result. It contains eight purposively selected questions from two proposal contexts, unequal generation protocols and budgets, mixed original/retest timing and possible cache effects, and no independent human scores. The diagnostic claim sample is non-exhaustive. Question and proposal dependencies preclude treating all observations as independent population draws. No new significance tests or population confidence claims are justified by this diagnosis.

Keep existing outputs and rating provenance. Have blinded reviewers score final user answers and exhaustive atomic claims before changing semantic ratings. A future version should test source-coverage planning, robust structured synthesis parsing and entity-to-value citation support, using matched declared decoding settings. Any resulting experiment must be a new regime with separate raw results. The 133 remaining reserved candidates are preserved. No additional model rerun is needed merely to confirm the already visible failures.

## Manuscript-ready statement

In a frozen-evidence exploratory sample, eight of 16 full-workflow observations omitted required source coverage and eight failed the synthesis header contract, despite successful underlying tool operations. Two contradicted budget claims in the verification-enabled variant passed structural reference and amount-presence checks. These findings demonstrate operational and semantic-validation limitations in this configuration, without estimating their prevalence in a wider question population.
