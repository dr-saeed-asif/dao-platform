# Post-fix scientific results

| Measure | Pre-fix | Post-fix |
|---|---:|---:|
| M5 invalid cases rejected from indexed evidence | 11/12 | 12/12 |
| M5 valid controls admitted | 3/3 | 3/3 |
| Stale chunk available before status invalidation | 1/1 | 0/1 |
| Active stale chunk SQL rows deleted | 0/1 | 1/1 |
| Scoped retrieval blocked after FAILED status | 1/1 | 1/1 |
| M6 classification matches | 15/16 | 15/16 |

All 15 M5 cases and 16 M6 service cases were retained with their original expectations. The pre/post CSV has 31 rows. M6's separate PostgreSQL interruption/resume/duplicate/omission fixture was also rerun, with four recorded observations. Its missing-event case still advances a cursor labelled scan_progress. These observations are excluded from the 16-case service classification denominator.

NestJS stage/link decisions remain 5/15 accepted, including the malformed PDF. Python rejects that malformed PDF before indexing. The corrected security result is the indexed-evidence gate and revocation behavior. The remaining staging distinction is explicitly reported rather than hidden in a combined score. Unlinked standalone indexing remains available to the operator workflow, while hash lookup of a known revoked governance artefact is blocked.

## Measured cleanup and retrieval

The stale-chunks fixture could not retrieve its previous content after replacement. Its active chunk count was zero after the read-triggered cleanup. The index metadata survived with status FAILED. A second deletion attempt returned 0. The standalone lookup control succeeded, and lookup of the known revoked hash was blocked. These checks used real isolated PostgreSQL and synthetic PDF fixtures. Embedding vectors and ProposalCreated anchor rows were synthetic. There was no independent human adjudication or live chain anchoring in this suite.

## Test commands and results

- AI virtual environment: `python -m unittest discover -s tests` passed **276 tests**. The five new focused regressions include replaced bytes, missing storage configuration, revoked/FAILED status, valid bytes and standalone revocation.
- DAO: `node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts --json --outputFile=research_evaluation/m5_m6_postfix/c7-tests.json` passed **56 tests**.
- AI compileall passed for the affected governance and cleanup modules. Git diff whitespace checks passed.
- Ruff, mypy and Pyright were unavailable. No clean lint/type-analysis result is claimed.
- The initial full Python run had five fixture-boundary failures after the integrity check was added. Adapter-only tests were updated to explicitly mock byte validation. The dedicated real-file and SQL regressions preserve the security assertions. Both earlier and final logs are retained.

## M6 and manuscript implications

The coherently stale scenario still returns verified because its inputs are identical to the control. This means agreement within the supplied provider view. Independent freshness, chain integrity and finality remain outside the evidence. No independent RPC comparison was possible.

For RQ2 and the document-admission contribution, the follow-up supports current-byte revalidation and disposal of derived active chunks in the tested replacement/revocation case. Report logical blocking and SQL-row deletion separately. The measured 12/12 result is a selected development-fixture outcome and supports no population-wide detection guarantee. Preserve 11/12 and 0/1 as the historical pre-fix measurements. Blockchain reconciliation claims must continue to disclose the single-provider trust boundary and silent-omission limitation.

## Execution and retention

The rerun used m5_document_integrity_postfix in the dedicated loopback PostgreSQL 16 container. Scripts copied the original fixture construction and changed only isolated database/output paths and the instrumentation needed to measure the new rejection outcome. Byte fixtures were copied exactly. Source snapshots and hashes identify all corrections. Production data and deployed contracts were untouched. Cleanup removes disposable derived text/vector rows and retains identity and audit metadata. Retention of database backups and WAL follows the operator's existing policy.

The CSV M5 duration sums the measured Nest admission component and Python indexing/read component. Fixture setup and the gap between those executions prevent interpreting it as a continuous end-to-end request latency.
