# CyberDAO benchmark execution audit
**PARTIALLY COMPLETE — snapshot 2026-11-12T07:18:23+00:00.**

1262/1,862 expected attempt records are parseable and uniquely keyed; 600 missing. Completed cells:9/14. Missing by condition:{'A1': 133, 'A12': 133, 'A2': 133, 'B3': 68, 'B4': 133}. The runner was active at this audit; a completion marker was not present at initial inspection. This audit launched no inference and never altered production, gold or campaign raw files. Tables below are provisional observations, not final full-campaign scores.

| Model | Condition | Saved/133 | Failures | Proxy matches/saved | Median / p95 seconds |
|---|---|---:|---:|---:|---:|
| qwen3:0.6b | B1 | 133/133 | 0 | 13/133 | 0.985 / 1.521 |
| qwen3:0.6b | B2 | 133/133 | 0 | 39/133 | 2.170 / 2.988 |
| qwen3:0.6b | B3 | 133/133 | 0 | 8/133 | 1.258 / 6.284 |
| qwen3:0.6b | B4 | 133/133 | 0 | 23/133 | 4.883 / 10.295 |
| qwen3:0.6b | A1 | 133/133 | 0 | 13/133 | 4.813 / 10.554 |
| qwen3:0.6b | A2 | 133/133 | 0 | 25/133 | 5.933 / 10.853 |
| qwen3:0.6b | A12 | 133/133 | 0 | 14/133 | 4.530 / 8.979 |
| qwen3:4b-instruct | B1 | 133/133 | 0 | 17/133 | 11.623 / 27.310 |
| qwen3:4b-instruct | B2 | 133/133 | 26 | 47/133 | 39.862 / 100.358 |
| qwen3:4b-instruct | B3 | 65/133 | 18 | 8/65 | 89.692 / 1572.147 |
| qwen3:4b-instruct | B4 | 0/133 | 0 | Not observed | Not observed |
| qwen3:4b-instruct | A1 | 0/133 | 0 | Not observed | Not observed |
| qwen3:4b-instruct | A2 | 0/133 | 0 | Not observed | Not observed |
| qwen3:4b-instruct | A12 | 0/133 | 0 | Not observed | Not observed |

| Model | Same-question pairs | Full minus RAG proxy (percentage points) | Four-scope bootstrap95% interval (pp) |
|---|---:|---:|---|
| qwen3:0.6b | 133 | -12.03 | [-16.81, 28.57] |

All original1,239 records retain their exact raw prefixes. All38 historical failures are preserved; 6 new failures are also retained. All failures remain in denominators. B1=no evidence; B2=plain frozen-document RAG; B3=single agent with22 permitted tools; B4=full graph and gates; A1=deterministic helpers off; A2=M7 blocking off only; A12=both. Full uses archived chain replay and trusted in-process operator context, not live HTTP/C4/C7 validation. Six-call/200-second case budgets and normalized seed42,temperature0.6,context8192,prediction1536 settings remain frozen. Effective transport mismatches:0; source-hash mismatches:0. Wire hashes computed before privacy redaction are separately distinguished from configuration errors.

Human annotation labels present:0; no independently human-adjudicated confirmatory result is claimed. These are exploratory automated reference matches, NOT independently adjudicated answer accuracy. Few documents/four shared scopes, four unavailable field projections, a fixed seed, architecture-specific prompts, conservative fallbacks, timeouts, retrieval phase and cache/GPU effects limit interpretation.

Reproducibility:historical manifest matched 169/169; saved resume backup matched 13/13; source configuration and question hash verified. The earlier partial-status manifest matches 54/61 current files:changed append-only results/status files make it stale for the present tree; see MANIFEST_VERIFICATION.json. This does not imply original raw corruption:archived prefixes were separately verified. A final campaign manifest does not yet exist. The audit's AUDIT_REPRODUCIBILITY_MANIFEST.json seals this fixed snapshot and all derived files.

Outstanding:finish all missing attempts, preserve additional failures, then run the prepared offline finalizer and verify the final campaign manifest. Human adjudication and its evidence-freeze prerequisites remain pending for confirmatory claims. Existing raw/results are preserved. No model runs were restarted by this audit.
