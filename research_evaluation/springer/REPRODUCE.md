# Reproduction

Use the DAO workspace root and its existing dependencies. Git source revision and compiled verifier digests are in `reconciliation_config.json`. The production controller and verifier run in a dedicated loopback Nest instance with an ephemeral token, a PostgreSQL read-only session and no application migrations. RPC reads use the configured chain. Runtime deployment evidence is in `deployment_checks.jsonl`. No transaction is submitted.

The existing campaign is complete. To collect a fresh campaign, copy the two Node scripts to a fresh sibling directory under `research_evaluation/`, retaining their relative path to the repository root. Build the API and run the copies.

```powershell
npm run build --workspace=api
node research_evaluation/<fresh-directory>/reconcile.cjs
node research_evaluation/<fresh-directory>/faults.cjs
```

The reconciliation runner appends one sanitized JSON observation per proposal and skips completed IDs when the build and cohort match. Event records retain grouped status counts to avoid exporting individual member evidence. The fixture runner creates a new exclusive output file. It reuses fixture definitions without running the existing Jest tests.

The saved security probe runs from the AI server checkout with its virtual environment and the AI checkout on `PYTHONPATH`. Use a fresh sibling copy of `security.py` for new observations. To regenerate the statistics and figures from the saved evidence, run `python research_evaluation/springer/analyze.py` from the DAO root with Matplotlib installed. The analyzer checks v3 provenance and archived raw hashes, and writes only derived artifacts. It sends no service requests.

For the benchmark, use the v3 readiness report and its saved evidence. Do not use the gold file as model input. The baseline table uses the prior eight-question diagnostic subset and is separate from the new verifier cohort and isolated fixtures. The full model comparison requires a later benchmark release.
