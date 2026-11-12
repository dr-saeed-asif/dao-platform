# Reproduce the recovery completeness follow-up

From the dao-platform root, build the current application, blockchain adapter and NestJS API. The recorded run reused the already-built PostgreSQL migration package. A fresh checkout must build its workspace dependencies first. Use the source tree and compiled hashes recorded in the manifest.

```powershell
npm run build --workspace=@dao-platform/application
npm run build --workspace=@dao-platform/blockchain-cyberchain
npm run build --workspace=api
node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts --json --outputFile=research_evaluation/recovery_completeness/c7-tests.json
npm run test --workspace=@dao-platform/application
npm run test --workspace=@dao-platform/blockchain-cyberchain
```

The recorded live run used the pre-existing dedicated test container cyberdao-recovery-m4-01 (PostgreSQL 16, pgvector image), bound only to loopback. See the prior recovery README for provisioning a fresh container with a randomly generated password. Never reuse the populated database from a recorded run. The launcher selects the named isolated database, refuses a nonempty public schema, applies the migration registry, and checks the original pin and RPC fingerprint before replaying chain events. Reproduce on a fresh environment with equivalent names, or explicitly update the isolated names in the scripts for a separate run.

```powershell
docker exec cyberdao-recovery-m4-01 createdb -U postgres recovery_completeness_v2
node research_evaluation/recovery_completeness/run.cjs research_evaluation/recovery_completeness/run-02
node research_evaluation/recovery_completeness/reliability.cjs research_evaluation/recovery_completeness/run-02
python research_evaluation/recovery_completeness/analyze.py research_evaluation/recovery_completeness/run-02
```

Use an unused output directory for reproduction. The reliability script creates two separate fixture databases and replays two saved event envelopes from the prior recovery experiment. The prior raw SQL snapshot and raw gateway events are local protected files. The launcher uses the RPC setting without printing credentials and allows only read methods. The original evidence files are read only. Raw records and SQL snapshots from this follow-up are also kept local and ignored by Git. The previous recovery ran reconciliation serially, whereas this run used concurrency three, so the wall times are descriptive.
