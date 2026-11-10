# Reconciliation follow-up

The six status mismatches came from a missing database-status alias. The database uses `FINALIZED`, while the contract returns `Closed` and records finalization separately. The November 8 implementation included assignment and event changes but omitted this alias. The archived deployment loaded that implementation correctly. Its assignment-count marker alone could not establish that status normalization was complete.

The verified production fix adds `FINALIZED: 'Closed'`. The separate finalization, winning-option and tie checks continue to run. The new targeted regression test passed, with ten unrelated tests skipped by its filter. The previously false-positive finalization fixture returned `verified` in its one affected post-fix run. The fresh isolated endpoint returned a verified `Closed`/`Closed` comparison for a finalized proposal. Source digest, compiled digest and the working-tree patch identify this uncommitted revision.

| Affected subset | Mismatched | Unverified | Verified |
|---|---:|---:|---:|
| Archived pre-fix observations | 7 | 0 | 0 |
| Post-fix retest of those seven | 1 | 6 | 0 |

The six corrected status cases remain unverified because SQL winning-option and tie fields are missing. The remaining mismatch is the assignment count. Seven post-fix observations have separate raw records. The other 32 proposals were not rerun, and no fresh 39-proposal post-fix result is claimed. Observation times and chain blocks differ between runs, so latency changes do not isolate the effect of the code patch.

The assignment investigator independently queried SQL and used direct contract `getProposal` and `isAssigned` calls at the archived block, checking the network and canonical block hash before and after. SQL contained 10 active rows for 10 distinct members. The contract counter was 9 and only 9 of those SQL-listed members were assigned at that block. This independently confirms the observed cross-store disagreement and rules out duplicate SQL rows as the count explanation. Historical SQL state, indexer freshness and the origin of the extra active row remain unknown. The evidence does not establish a blockchain fault. No governance data was repaired to change a research outcome.

The earlier six classifiable fault cases contained one false positive. Only that affected control was rerun, and it now passed. The other five observations retain their original code version and measurement times. The earlier chain-only-event fixtures also showed an aggregate event-count mismatch while their individual rows were unverified. This follows the aggregate count comparison and remains a limitation of checkpoint-aware interpretation. A checkpoint-specific diagnosis is still unavailable. Those completeness cases were outside the original six-case confusion matrix.

The 141 unexposed, LLM-reviewed candidates remain reserved. Human-adjudicated whole-answer and claim-support results are unavailable. `evaluation_preparation.json` specifies the existing B1–B4 definitions, scoring rubric and outstanding evidence-freeze gates. `human_assessment_template.csv` contains 141 blank reviewer records. No model trial was repeated or newly generated during this follow-up.

The one-line source fix and its regression are the only production-tree changes. Original measurements remain archived. Raw records, code patch, before/after table, figure and provenance are in this directory.
