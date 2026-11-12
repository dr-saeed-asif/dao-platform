# Experiment 1 methodology

This M4 follow-up applies the locally built C7 verifier to the exact 39 identifiers in the archived Springer reconciliation roster. The unit of analysis is one proposal. Each receives one attempt, sequentially, with no outcome-dependent retries. The historical dataset and raw outputs are retained separately.

Preflight requires matching TypeScript and compiled verifier output, passing verifier regressions, all 39 rows with on-chain identifiers and the configured deployment, matching RPC chain ID, and a PostgreSQL transaction that reports read-only mode. SQL reads use one repeatable-read transaction, with a server-side read-only default and a statement timeout. The experiment invokes the compiled service directly. It does not start the production application, migrate tables, or submit blockchain transactions. RPC calls are restricted to the seven read methods in the runner. The service's existing event scan and receipt caps apply.

For the recorded run the pin policy used the latest height returned by the configured provider at preflight, with zero confirmation offset. The runner records the pin and its hash before any proposal, then enforces that hash on all reads of that block. Contract state reads use the pinned height. A separate caller-selected decimal pin can be supplied through C7_PIN_BLOCK. The run uses a single provider and offers no independent proof of chain integrity or finality. The SQL snapshot is contemporary rather than reconstructed at the pinned block. The older experiment used 27 pins. Comparing cohorts by proposal ID describes outcome transitions but does not isolate the effect of the software changes.

Per-proposal raw records contain the on-chain values, SQL values used in field comparisons, checkpoint, field outcomes, events, receipts, and available reasons. The private SQL snapshot includes the cohort rows, votes, assignments, canonical indexed governance events and scoped checkpoints. Raw records and SQL inputs are Git-ignored because they may contain private data. The public CSV and summary retain proposal IDs, scalar mismatches, checkpoint evidence and categorized uncertainty without vote addresses or event payloads. RPC identity is recorded as SHA-256 fingerprints of the normalized endpoint and origin so credentials or URL tokens are excluded from output.

The analysis distinguishes verified, mismatched, unverified, unavailable, failed and not attempted. Unavailable indicates a verifier report with incomplete required evidence or a failed dependency. Failed means a thrown execution exception. A known discrepancy can take precedence over uncertainty in the service outcome. A lagging checkpoint forces an unverified coverage check even if every compared scalar agrees. This measures evidence sufficiency and detected disagreement, with no externally adjudicated ground-truth labels.

Commands executed from the repository root:

```powershell
node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts
node research_evaluation/c7/reconcile.cjs --check-build --out research_evaluation/experiment_1_m4/build-check-01
node --check research_evaluation/experiment_1_m4/reconcile.cjs
node --check research_evaluation/experiment_1_m4/run-local.cjs
node research_evaluation/experiment_1_m4/run-local.cjs --out research_evaluation/experiment_1_m4/run-01
node research_evaluation/experiment_1_m4/check-assignment.cjs research_evaluation/experiment_1_m4/run-01
python research_evaluation/experiment_1_m4/analyze.py research_evaluation/experiment_1_m4/run-01
python research_evaluation/experiment_1_m4/manifest.py research_evaluation/experiment_1_m4/run-01
```

The C7 suite passed 50/50. The build equality check passed. The launcher used the available local connection settings without printing them. For a new run, supply equivalent configuration through the environment and choose a fresh output directory. Pass `--output-dir` to the analyzer to preserve published outputs. The additional assignment probe reconstructs membership from the returned events and independently requests the extra SQL row's referenced receipt from the same provider. It saves counts and receipt metadata without member addresses. The saved worktree status, patch and SHA-256 hashes identify the uncommitted verifier precisely. The manifest records the actual timestamps, revision, pin and outcome counts.
