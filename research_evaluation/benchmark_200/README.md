# CyberDAO benchmark development artifacts

Read [FINAL_REPORT.md](FINAL_REPORT.md) before using any result. The full benchmark is **blocked**. There are 200 candidates, 175 provisional source-checked entries, 25 quarantined absence judgments and 20 saved smoke attempts. Four title-question attempts are contaminated and excluded. Twelve eligible answer attempts and four common-boundary HTTP denials remain. This is not a completed 200-question comparison.

The continuation adds **32 new real-model attempts** on eight previously unrun source-checked count questions, with no independent semantic validation. See [CONTINUATION_RESULTS.md](CONTINUATION_RESULTS.md). The source audit, B2 diagnosis, all four exclusion records, 25 quote-anchored replacement proposals and blind/adjudication materials are under [review/](review/EXTERNAL_REVIEW.md). Originals and smoke results are unchanged. The proposed replacement benchmark is unreleased.

## Files

- `questions.json` holds all candidates. `questions_verified.json` excludes quarantined questions.
- `ground_truth.json` holds expected answers, verification status and source references. The generation runner never reads this file.
- `quality.json` records exact-text/declared-target uniqueness, source overlap and release blockers.
- `evidence/` holds the real sanitized SQL/chain/PDF snapshot, independent chain reads, SQL drift checks and authorization preflight records. The original PDFs remain in `../datasets/source_documents/`.
- `raw_results/` contains immutable provider outputs, generated answers, fallback notices, tool failures, latencies and model/configuration manifests. No mocked model responses are used.
- `archive/` preserves pre-correction data and authentic launch scripts/datasets. These are audit records, not the current benchmark release.
- `metrics/`, `tables/` and `figures/` contain derived statistics, diagnostic claim annotations, CSV and standalone SVG exports.

## Reproduction

Run Python application scripts from the AI repository with its existing venv. Dependencies are the existing application plus `pypdf`. Run Node verification from the DAO repository with its existing `ethers` and `dotenv` dependencies. Keep credentials in the existing application environment; never put them in benchmark artifacts.

```powershell
$Bench = 'E:\DAO\cyber-chain-work\dao-platform\research_evaluation\benchmark_200'
Set-Location E:\DAO\cyber-chain-work\api-ai-server1\api-ai-server
$env:PYTHONPATH = (Get-Location).Path
$env:DAO_BACKEND_URL = 'http://127.0.0.1:3002'
$env:OLLAMA_CHAT_MODEL = 'qwen3:0.6b'
$env:OLLAMA_FAST_MODEL = 'qwen3:0.6b'
& .\.venv\Scripts\python.exe "$Bench\scripts\validate.py"
& .\.venv\Scripts\python.exe "$Bench\scripts\analyze.py"
& .\.venv\Scripts\python.exe "$Bench\scripts\report.py"
```

Those three commands use saved data only. Do not regenerate the evidence or questions inside this captured campaign. For a new isolated campaign, preserve the current directory, capture fresh evidence with `capture.py`, build candidates with `build.py`, independently adjudicate gold and repeat validation. Capture refuses to overwrite its snapshot. `build.py` reuses saved authorization probes when present. Neither source anchoring nor exact-target uniqueness establishes semantic validity.

Run `scripts/plot.py` with Matplotlib 3.11.2 available to regenerate the SVG and 300-dpi PNG after analysis, and `scripts/seal.py` last to update artifact hashes. Earlier evaluation dependencies were installed outside application environments; no new production dependency was installed for this expansion.

For a **new** smoke campaign use `run.py --phase smoke --campaign fresh-name --ids DB-002 PDF-005 MS-001 UA-001`. Published smoke questions are development cases and must not be reused as held-out confirmatory cases. Each completed or failed attempt is appended, flushed and fsynced. Resuming the exact unchanged campaign skips saved `(question ID, variant)` pairs, including failures. Changed model configuration, runner hash or question-file hash causes a refusal instead of silently combining different experiments. Closed historical smoke campaigns retain launch versions in `archive/`; do not resume them with corrected questions or the newer runner.

`run.py --phase full --campaign full-v1` currently refuses execution. It requires a ready quality record and exactly 200 verified unique cases. Resolve the absence-review, semantic duplication and holdout conditions before a new full study. Incorrect model answers remain measured outcomes and are not a reason to censor a valid full campaign. Do not relabel the quality record as ready merely to bypass validation. The current design records one observation per question/variant; repeated stochastic campaigns require new campaign labels and predeclared seeds/settings.

Governance database sessions are read-only. The B2/B3/B4 chain adapter replays the same captured real response. No model can choose an RPC URL or send a transaction. Optional `check_database.py` makes a read-only SQL consistency check. Optional `verify_chain.cjs` makes only `eth_call` and block reads at saved blocks. These are separate source verifications, not new answer trials. No production functionality was changed.

Unanswerable accuracy, unauthorized response-body disclosure and independent claim support remain unknown. Interpret automatic claim flags and lexical proxies separately from semantic accuracy. Diagnostic assistant annotations must not be presented as independent human evaluation. Three questions from one demo proposal do not justify population confidence intervals or significance tests.

Raw outputs can contain local paths and public demo identifiers. Automated credential/address screening found no exported credentials or member addresses; an independent privacy review is still required before public release. `provenance.json` hashes exact saved bytes and does not certify scientific validity.

## Continuation reproduction

From the AI repository and environment above, use `scripts/diagnose_b2.py` and `scripts/analyze_subset.py` to reproduce the saved-trace diagnosis and the 32-attempt subset statistics without generation. `scripts/review_saved.py` performs same-assistant source checks only; `scripts/prepare_external.py` creates unreleased reviewer drafts. Run `scripts/report_continuation.py` before `scripts/report.py`, and `scripts/plot_subset.py` with Matplotlib to regenerate the new figure. Seal last.

`run.py --phase subset --campaign source-counts-v1` is resumable only with its frozen launch configuration and source files. It skips every completed or failed `(ID, variant)` checkpoint and rejects question overlap with prior campaigns. The campaign is already complete; do not rerun it for new results. Its selected IDs are in `review/eligible_subset.json`. `preflight_subset.py` checks only read-only source counts/infrastructure; `--output subset_postflight.json` preserves the initial preflight when recording a post-run check. Both checks passed. No production settings or source files were changed.
