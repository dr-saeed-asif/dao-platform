# C7 reproducibility

Final preparation: `prepared-v3/configuration.json`. No C7 live reconciliation was executed. Historical inputs under `../springer/` and `../springer_followup/` remain unchanged.

From dao-platform:

```powershell
node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts assistant.spec.ts python-ai.adapter.spec.ts rpc.controller.spec.ts postgres.service.spec.ts
npm run test --workspace=@dao-platform/blockchain-cyberchain
npm run build --workspace=api
node --check research_evaluation/c7/reconcile.cjs
node research_evaluation/c7/reconcile.cjs --check-build --out research_evaluation/c7/prepared-next
```

From `apps/api`:

```powershell
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit --incremental false
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false
node ../../node_modules/eslint/bin/eslint.js src/ai/blockchain-verification.service.ts src/ai/__tests__/blockchain-verification.spec.ts
node ../../node_modules/prettier/bin/prettier.cjs --check src/ai/blockchain-verification.service.ts src/ai/__tests__/blockchain-verification.spec.ts
```

Full test-inclusive type checking and lint are not clean; consult the main report and `lint-comparison.json`.

## Live procedure, NOT executed

Privately inject `C7_DATABASE_URL`, `CYBERCHAIN_RPC_URL`, `CYBERCHAIN_CHAIN_ID`, `GOVERNANCE_CONTRACT_ADDRESS`, `GOVERNANCE_DEPLOYMENT_BLOCK` through the operator's configuration manager. Use a SELECT-only evaluation account for proposals, votes, assignments, governance_events and scoped indexer_checkpoints. Never put credentials in research artifacts or command logs.

Set `C7_PIN_BLOCK` to one reviewed decimal block for every proposal. Otherwise latest minus nonnegative `C7_FINALITY_DEPTH` is used; default zero does not guarantee finality. Ensure historical RPC calls and bounded log queries are supported.

```powershell
npm run build --workspace=api
node research_evaluation/c7/reconcile.cjs --run --out research_evaluation/c7/observations-next
```

Output directories must not already exist. The script verifies exact 39-item roster coverage and type-checked source/compiled equality, records Git HEAD plus dirty flag and hashes, saves a source patch, enforces READ ONLY and a single REPEATABLE READ transaction, and pins every proposal to one block. It invokes the actual compiled verifier directly without deploying or signing transactions. The SQL snapshot/time and pin/hash are recorded. Responses are flushed after every proposal. JSON metrics and CSV outcomes separate verified, mismatched, unverified, unavailable and thrown failures with exact denominators and uncertainty reasons.

On infrastructure failure preserve partial JSONL and sanitized `execution_failure.json`; absent rows are not successes. Existing output directories are refused; no selective retries are automatic. `sql_evidence.local.json` is Git-ignored and must stay in controlled storage because it may contain private governance information. Privacy-review any publication.

The historical cohort used 27 pins and has no restorable time-aligned SQL snapshot. A new campaign is a new observational follow-up, not a paired reproduction. Contemporary repeatable-read SQL is not historical SQL at the chain block. Independently establish deployed bytecode/ABI equivalence; the procedure records deployment configuration but does not prove it.

`manifest.json` records exact source, compiled, script, configuration, report and historical-input hashes. HEAD is a base commit, not a fabricated post-fix commit. The working-tree patch and SHA identify the correction. Earlier C7 preparations and pre-fix source/test snapshots remain preserved. Unit tests mock SQL/RPC; HTTP tests use real in-process Nest/Fastify with those fixtures. They are not live-chain measurements.
