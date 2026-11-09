# Experimental methodology

## Questions and planned comparisons

| Experiment | Research question and directional hypothesis | Evidence and unit of analysis |
|---|---|---|
| E1 Answer accuracy | Does scoped evidence increase correct answers to source-specific questions? Expect higher gold match with tools than without records. | Six authored cases available, four selected for the small-model pilot. Unit is the question. Two planned repeats per condition are reliability observations. |
| E2 Citation reliability | Do reference validation and repair reject invalid IDs, and what unsupported claims can still pass? | Live final-answer citation IDs, automatic claim flags, eight labeled challenge answers, and three scripted graph runs. |
| E3 Agent effectiveness | Does specialist routing improve coverage relative to a PDF-only worker, and what does worker validation add? | Paired variants on the same questions, randomized mode order per question and repeat. |
| E4 Security | Do tested boundaries reject the specified unauthorized requests and transactions? | Six live HTTP negative probes, four local EVM tests and existing Python/Nest suites. Endpoint and test outcomes are reported separately. |
| E5 Consistency | Do indexed governance records and deployed contract observations agree at the selected snapshot? | Four purposively selected demo proposals. Report per-proposal and per-comparison status, plus independent read-only SQL totals. |
| E6 Performance | What wall time, retrieval overhead, check latency, and token consumption occur under serial pilot load? | Each attempt through the in-process entry point plus latency of the live verification HTTP endpoint. |

## Conditions and measurement

- **LLM-only** calls the configured Ollama model without DAO context, with an explicit instruction to acknowledge missing private facts. Its prompt differs from the grounded path.
- **Single evidence worker** forces one evidence task and uses actual retrieval and the same progressive synthesis path. It skips semantic planning. It measures this restricted RAG policy, including expected coverage limits for database questions.
- **Worker gate off** uses the semantic planner and multi-agent workflow with only the specialist verification and repair decision bypassed. It extracts reference IDs for downstream bookkeeping. Synthesis-level reference, currency, and claim checks stay enabled.
- **Full** runs the semantic planner, validated specialist routing, worker verification and final synthesis. The harness measures these core components directly. Wallet authentication, SSE transport, DB conversation persistence and browser rendering are outside the latency boundary.

Every direct PostgreSQL connection is server-enforced read-only. Existing file/index contents and local Ollama are used. Read-only failures to persist internal evaluation telemetry are expected; a re-index requiring writes may fail and must be retained in results. No chain transaction is submitted. The contract suite deploys only to in-process Ganache using the existing compiled artifact. Live HTTP calls use the existing configured CyberChain deployment and stored demo records.

The model server is Ollama 0.40.5. Manifest files retain exact model digests and package versions. Both model regimes use the same embedding model. Planner settings are temperature 0, no thinking, 8,192 context, up to 3,072 output tokens and 85-second HTTP timeout per call. Grounded chat uses temperature 0.6, seed 42, 8,192 context and bounded 1,536/3,072 generation attempts. LLM-only uses seed 42, temperature 0.6, and a 1,024 output cap. Concurrency is one and retrieval top-k is four. The order seed is 42. Model cache and GPU state were not reset between attempts. The first larger-model run was deliberately interrupted after the first completed response for time, and the faster model campaign is a separate regime.

Wall time includes planner time where applicable, and includes the latency of failed attempts. Workflow token counters omit planner tokens, so they are not total per-turn token counts. Unknown counters remain null. Retrieval latency is the reported tool retrieval duration. Worker citation check latency is summed from measured spans. There is no metered external API charge available, and host electricity and equipment costs were not measured.

## Scoring and statistics

Gold comes from independent SQL and original PDF pages before inspecting answers. The automatic rubric checks the title phrase, a quantity next to the requested noun, or a formatted budget amount. Failed or absent answers count as misses. Correct gold fragments are not a guarantee that the complete answer is correct. Any separately reviewed answer-level judgments must be retained with the answer key, scoring decisions and reviewer limitations. Structural citation validity counts unique ID references per answer that are present in its exported sources. An answer with no citation is not assigned a validity of 100%. Automatic claim flags are separate from semantic support and cannot identify all errors.

Descriptive medians and counts are reported by mode, with Wilson intervals for first-repeat lexical proportions and an exploratory bootstrap that resamples questions, averaging repeats within question. Cases share proposals and were deliberately selected. These intervals are descriptive and do not support population claims. Paired outcomes should be compared on matched case/repeat IDs only. No inferential significance test is used for this small, nonrandom pilot. No tail percentiles are estimated from sparse samples.

The known-answer citation challenge isolates gate behavior under scripted outputs. A scripted repaired answer tests retry control flow, not the probability of repair by a real model. Security fixtures test stated cases and cannot establish audit-level security. A live status mismatch may reflect a state encoding difference, index lag, or a true disagreement. Event counts alone do not imply matching event identity.
