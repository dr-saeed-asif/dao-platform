# Frozen-evidence exploratory comparison

The selected eight questions were previously unexposed in the saved v3 ledger. They cover two database identifiers, two PDF allocations, two multi-source requests and two PDF-bounded unknowns, across two demo proposals. Model generation used the existing B1–B4 implementations and the existing local model digests. Provider options and all attempted outputs are retained.

## Records and exclusions

`../exploratory_frozen_v1/responses.jsonl` preserves 32 initial attempts. A research adapter omitted the connection timeout argument required by database callers and incorrectly called `model_dump` on dataclass metrics. These defects masked SQL-backed tool results. Sixteen B3/B4 attempts and two SQL-using B2 attempts were harness-invalid. The remaining 14 B1/B2 attempts were unaffected.

This directory preserves 18 corrected, affected retests. The local recorder now uses `dataclasses.asdict`, and the pool adapter forwards timeout. Before retesting, real proposal/voting tools passed without generation. No unaffected completed attempt was repeated. The comparison selects 14 initial records and 18 retest records, yielding eight unique question/variant pairs per variant. All 50 raw attempts remain saved. Invalid attempts are excluded explicitly, not relabelled as model failures.

`analysis_manifest.json` records denominators. `scores.json` links every selected observation to its raw file and line. `assistant_ratings.json` records same-assistant, post-hoc whole-answer and abstention judgments. `diagnostic_claims.csv` is a purposive 18-assertion source-support sample, not an exhaustive claim population. Independent human adjudication remains pending. Citation IDs are scored structurally by code, separately from factual support.

## Frozen state

One exported read-only PostgreSQL MVCC snapshot was imported by each SQL tool transaction within a campaign. The document index was included. The corrected verifier captured the two chain reports using that same SQL snapshot, then B2/B3/B4 replayed the same sanitized reports. No model mock supplied an answer. Source redaction removed wallet addresses and URLs uniformly.

The retest imported a new SQL snapshot whose full-public-table fingerprints matched the initial campaign, and reused byte-identical chain responses. The fingerprints combine sorted per-row MD5 values and table counts. Configurations record model digests and source/build hashes. This checks source consistency across runs without exporting private table rows. It does not reconstruct historical SQL state at a chain block. Runtime clocks, cache state and observation times differ.

Resume requires unchanged source fingerprints, model/build configuration and runner hash. The completed campaign should not be rerun. For a genuinely new campaign, preserve these directories and use a fresh version. SQL snapshots expire when the exporting process closes, so a resume imports a fresh snapshot only after fingerprint equality. Failed attempts are checkpoints and are skipped. `setup/` retains the no-generation preflight failures. The initial Windows SelectorEventLoop subprocess setup was corrected by running the Node helper in a thread.

## Regeneration

Run `analyze.py` from the AI repository using its virtual environment and that repository on `PYTHONPATH`. It reads gold only after generation, checks campaign fingerprints and immutable snapshot bytes, and derives tables and source-linked ratings without model calls. `publish.py` runs from the DAO repository with Matplotlib available and updates manuscript artifacts from the saved evidence.

The whole-answer rubric treats safe declines on bounded unknowns as correct when no false value is supplied. Missing requested facts are unanswered. Materially wrong identifiers, allocation labels or false database absence claims are incorrect. The rubric application was performed after observing responses and is exploratory. A useful factual fallback can be correct even when its output origin is mixed. A technical-unavailability fallback is counted separately from semantic abstention.

`exposure_ledger.json` marks the eight newly exposed question IDs. The original v3 dataset remains byte-identical, and `remaining_unexposed_questions.json` contains the 133 candidates still unexposed in the saved ledger. A subsequent study must apply this ledger before claiming held-out status.
