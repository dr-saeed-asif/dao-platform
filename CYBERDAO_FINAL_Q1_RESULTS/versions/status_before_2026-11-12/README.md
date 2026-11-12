# Reproducibility
Run from the AI repository with its existing virtual environment and PYTHONPATH set to that repository. Supply the local import-only RAG_DEV_TOKEN setting if absent; generation scripts never send it to a service. Never publish real .env values.

Executed commands (all scripts below are under this directory's scripts/):

1. test_adapters.py — nine offline adapter tests, passed; static_checks.json.
2. audit_claims.py — 169 prior hashes verified; initial 24 provisional claim checks. Do not rerun to resume generation.
3. correct_claim_fixture.py — two affected source-page corrections only; original measurements preserved.
4. run.py --smoke — original 18 development attempts before interruption. Remaining live-SQL smoke is blocked by Docker. Original configuration/source are archived in versions/v1_interrupted/.
5. b1_without_database.py — checkpointed B1, 133 IDs × two real models. raw/responses.jsonl.
6. frozen_corpus_rag.py --smoke; validate_frozen_smoke.py; frozen_corpus_rag.py — separate frozen-corpus real-embedding RAG adapter. raw/frozen_rag_smoke.jsonl and raw/frozen_rag_responses.jsonl. The development smoke used 180-second HTTP timeout; benchmark generation uses 100 seconds to match B1, with identical model prompts/decoding. Exact old smoke source is archived.
7. test_analysis.py — initial nine-test run reproduced the unknown saved-abstention-enum bug; corrected run passed 9/9. Original derived results and source remain under versions/scoring_v1/.
8. verify_historical.py — read-only checks of 32 pilot, 39 recovery, 31 M5/M6 and three streaming records.
9. analyze.py; report.py; figures.py; seal.py — derive reports, figures and manifest. These read gold only after generation; they cannot serve as independent human scoring.

B1 and frozen B2 resume by (question ID, model) and retain failures as completed attempts. There is no automatic selective retry. Configuration/source/hash mismatch stops resume. Original questions and gold remain in ../research_evaluation/benchmark_200/ and ../research_evaluation/exploratory_frozen_v2/. New ledger records exposures separately. Do not call attempted questions unexposed.

Models: qwen3:0.6b and qwen3:4b-instruct; embedding qwen3-embedding:0.6b. Digests, seed42, temperature0.6, context8192, output limit1536 and concurrency2 are saved. No remote API cost/energy was metered. Architecture-specific prompts and exact normalized provider payloads are preserved, with endpoints/wallets/emails redacted.

Frozen B2 ranks the actual archived page chunks by cosine of real embeddings; it does not substitute mocked model outputs. It is a different storage adapter from production PostgreSQL and must be labelled accordingly. Embeddings are precomputed/shared across models; generation wall excludes them. Do not pool its timings with live-SQL smoke or historical studies.

B3/B4/full ablations and new direct SQL are blocked while primary PostgreSQL is unavailable. Do not substitute guessed SQL, synthetic full-workflow behavior or historical results. Confirmatory approval still requires genuine human review/adjudication and a suitable unexposed cohort. Current model runs are explicitly exploratory.

Plot libraries were installed only into .plot_deps/ (ignored), not into application dependencies. Recreate with Python pip --target <this-directory>/.plot_deps matplotlib>=3.9,<4; exact installed version is in figure_versions.json. Volatile local Ollama logs, packages and bytecode are excluded from publication hashes. Raw model/evidence/results files remain included.

The earlier PostgreSQL block was resolved. live_campaign/ resumes only B3/B4/A1/A2/A12 after reusing completed smoke keys and verifying identical table/chunk/model/source hashes. The 26-case scalar SQL baseline executed separately, without gold in inference. Final reports are refreshed by report_live.py; finalization waits for 1,330 live attempts and includes the previous 532 B1/frozen-RAG attempts. Frozen chain reports are replayed, so B4 is the full AI graph, not a live C4/C7 HTTP/deployment test.

The finalizer creates lossless .jsonl.gz copies and raw_archive_index.json with verified original/compressed hashes. Uncompressed originals over 20 MB remain local and are Git-ignored, never deleted. After cloning publication artifacts, run scripts/archive_raw.py --restore before analysis; it refuses to overwrite differing existing originals.
