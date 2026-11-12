# C7 Blockchain Verification Report

## Root cause and verified correction

The archived verifier compared SQL FINALIZED literally with contract Closed, yielding six false status discrepancies. **The FINALIZED-to-Closed fix already exists at base commit and is retained.** It is not presented as a newly unfixed bug. Contract `proposalState` in `packages/contracts/contracts/CyberDAOGovernance.sol` returns only Pending=0, Active=1, Closed=2, Cancelled=3; finalization introduces no fifth state.

Two remaining bugs were reproduced before changing production code: unknown SQL status became mismatched through raw-string fallback, and chain events after the indexer checkpoint contaminated event-total comparisons. Initial tests: **11/13 passed, 2/13 failed**, expected unverified versus actual mismatched in both cases. See `research_evaluation/c7/pre_fix_regression.json` and preserved `pre_fix_*.txt` sources.

`SyncGovernanceUseCase` persists ACTIVE on publication, including scheduled proposals. `PostgresProposalRepository.listFiltered` derives temporal presentation state from dates. The verifier now uses SQL starts/ends and the pinned chain timestamp for ACTIVE, rather than asserting Active forever. Independent SQL/chain timestamp comparisons are retained.

## Explicit typed mapping

SQL CHECK (`operational-dao.migration.ts`) permits six operational statuses. The domain enum contains additional lifecycle spellings; the map exhaustively covers that enum and operational/legacy spellings.

| SQL/domain status | Contract expectation | Behavior |
|---|---|---|
| DRAFT | None asserted | Unverified unpublished lifecycle if chain ID exists |
| PENDING / PENDING_ON_CHAIN | None asserted | Publication pending is not contract timestamp-based Pending |
| ACTIVE / legacy VOTING_OPEN | Pending, Active or Closed | Derived from SQL window and pinned clock, including exact boundary times |
| VOTING_CLOSED / CLOSED | Closed | True disagreement remains mismatched |
| FINALIZED | Closed | Existing fix retained; finalized flag, winning option and tie checked separately |
| CANCELLED | Cancelled | True disagreement remains mismatched |
| EXECUTED / FAILED | Unsupported | Unverified; repository rejects these for this contract lifecycle |
| Unknown, inherited property keys, invalid/missing temporal inputs | None | Unverified with reason; no raw-string fallback |

Missing SQL winner/tie data still produces unverified, not inferred agreement. No on-chain ID returns unverified without RPC access.

## Indexer checkpoints and uncertainty

Read the real `indexer_checkpoints` row for proposal chain/contract, `governance-full`, version `1` (actual indexer repository default). Reports add indexer identity/version, height/hash, available update time, signed lag in blocks, classification and reason.

| Condition | Treatment |
|---|---|
| Current height | Equals pin; supplied hash must match canonical block |
| Lagging | Coverage ends at checkpoint; later chain-only events are unverified |
| Ahead | Historical SQL cannot be inferred; coverage unverified |
| Missing | Coverage unverified |
| Malformed height/hash or noncanonical hash/height | Invalid; no checkpoint reconciliation claim |
| SQL/RPC error | Unavailable checkpoint, unverified coverage; independent comparisons continue |

The current indexer writes null hashes via `setLastProcessedBlock`. Height-only coverage is explicitly labelled as lacking canonical hash anchoring and is not proof of reorganization-safe indexing. Event totals use only the fully scanned, checkpoint-covered interval with verified proposal creation. A missing indexed event within covered history is mismatched. Direct stored event/vote contradictions remain mismatched under lag.

A stale checkpoint alone never suppresses count mismatches. Only an exact signed count difference explained by canonical, not-yet-indexed VoteCast/MemberAssigned/MemberUnassigned events after the checkpoint becomes **unverified**, never verified. Unexplained SQL assignment excess remains mismatched. This is a supported lag explanation, not proof of exclusive causality. Other state/metadata/receipt contradictions are not blanket downgraded.

Pinned RPC block height must equal the requested block. Missing/partial ABI responses, unavailable receipts and RPC failures cannot produce verified. Reverted receipts remain mismatched. Final canonical hash is rechecked; changed/absent canonical evidence withdraws verification. Existing bounded log/receipt limits remain.

## Modified files

- `apps/api/src/ai/blockchain-verification.service.ts`: mapping, temporal semantics, checkpoint metadata, covered event totals, exact event-delta explanation and block validation.
- `apps/api/src/ai/__tests__/blockchain-verification.spec.ts`: scoped checkpoint fixtures, regressions and HTTP integration.
- `research_evaluation/c7/`: preserved pre-fix sources, test/lint records, historical summary, prepared configurations, evaluation script, source patch and manifest.
- This report. No contract, migration, production data, credentials, AI identity implementation or historical experimental output changed. Pre-existing C5/C6 edits remain intact.

## Commands actually executed and results

Root commands are shown below; `../../` commands ran from `apps/api`. Complete command arguments are also in `research_evaluation/c7/README.md` and machine-readable test records.

| Check | Command | Actual result |
|---|---|---|
| Initial red tests | `npm test --workspace=api -- --runInBand blockchain-verification.spec.ts` | 11 passed, 2 failed; npm ignored workspace runInBand argument |
| Final verifier/HTTP | `node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts` | 50/50 passed: 47 unit/fixture cases, 3 HTTP cases |
| Relevant Nest regressions | `node ../../node_modules/jest/bin/jest.js --runInBand blockchain-verification.spec.ts assistant.spec.ts python-ai.adapter.spec.ts rpc.controller.spec.ts postgres.service.spec.ts --json --outputFile=../../research_evaluation/c7/jest-results.json` | 117/117 passed in 5 suites; includes the 50 above |
| Adapter/C1 regression | `npm run test --workspace=@dao-platform/blockchain-cyberchain` | 19/19 passed in 3 suites |
| API build | `npm run build` from apps/api | Passed |
| Production type check | `node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit --incremental false` | Passed |
| Full type check | `node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false` | Failed: two pre-existing assistant-cyberchain.spec.ts:46-47 transaction fixture errors (gasPrice/nonce); no new reported C7 type error |
| Targeted lint | `node ../../node_modules/eslint/bin/eslint.js src/ai/blockchain-verification.service.ts src/ai/__tests__/blockchain-verification.spec.ts --format json --output-file ../../research_evaluation/c7/eslint-final.json` | Failed; base/final counts below |
| Formatting | `node ../../node_modules/prettier/bin/prettier.cjs --check src/ai/blockchain-verification.service.ts src/ai/__tests__/blockchain-verification.spec.ts` | Passed after formatting |
| Evaluation syntax | `node --check research_evaluation/c7/reconcile.cjs` | Passed |
| Preparation/build equality | `node research_evaluation/c7/reconcile.cjs --check-build --out research_evaluation/c7/prepared-v3` | 39 distinct archived IDs prepared; source/compiled equality passed; live attempts 0 |

Lint baseline uses Git HEAD through ESLint `--stdin --stdin-filename`, without replacing working files. Existing unsafe RPC/mock debt remains; added deliberately malformed mocks introduce additional test lint debt. No lint rule was disabled. A clean lint result is not claimed.

| File | Base errors | Final errors | Base warnings | Final warnings |
| blockchain-verification.spec.ts | 37 | 64 | 5 | 13 |
| blockchain-verification.service.ts | 50 | 47 | 17 | 22 |

Coverage: all operational/domain states, unknown/inherited keys, four temporal boundaries, FINALIZED and finalization flags, true state disagreement, unexplained excess assignments under lag, exact event-explained vote deficits, missing/current/lagging/ahead/invalid checkpoints, wrong hash, RPC timeout, missing/partial ABI data, inconsistent pinned height, unavailable/reverted receipts, reorganization and HTTP 401/403/200 paths. HTTP integration is real Nest/Fastify with mocked SQL/RPC, not live PostgreSQL/chain integration. No new live timeout or role-permission measurement is claimed.

## Historical evidence, not new C7 observations

| Evidence/version | Attempts | Verified | Mismatched | Unverified | HTTP/transport failures |
|---|---:|---:|---:|---:|---:|
| Original pre-alias cohort | 39 | 23 | 7 | 9 | 0 |
| Earlier targeted status-fix recheck, different pins/times | 7 | 0 | 1 | 6 | 0 |
| New C7 live campaign | **0** | - | - | - | - |

Original cohort used 27 pins and current SQL. Earlier targeted rechecks fixed six status comparisons, but missing winner/tie data left those proposals unverified overall. The remaining observed assignment disagreement was SQL 10 versus contract 9; archived investigation linked an extra SQL assignment to a reverted assignMembers transaction. It is not a blockchain fault. No authoritative record was changed to force agreement; exact historical writer attribution remains limited.

Original six classifiable fault fixtures remain **4 TP, 1 FP, 0 FN, 1 TN**. The earlier affected FINALIZED control retested as verified. C7 regression cases are not a new fault-detection confusion matrix. Sources: `research_evaluation/FINAL_PAPER_EVIDENCE.md`, `springer/reconciliation.jsonl`, `springer/fault_injection.json`, `springer_followup/reconciliation.jsonl`, `springer_followup/metrics.json` and `springer_followup/fault_injection.json`. `c7/historical_summary.json` recomputes counts without editing source records.

## Evaluation preparation and provenance

`c7/reconcile.cjs` and `c7/README.md` define an exclusive-output, read-only procedure using the exact 39-item archived roster, one documented chain pin and one repeatable-read SQL transaction. Type-checked source/compiled equality verifies the actual class used. Record Git HEAD, dirty source flag, source/compiled/script/input hashes, source patch, SQL snapshot/time, deployment configuration, pin/hash, checkpoint details and per-proposal full reports. Flush raw JSONL and preserve all failures. JSON metrics/CSV distinguish verified, mismatched, unverified, unavailable and thrown failures with exact attempted/expected denominators. Private SQL evidence is Git-ignored and requires controlled storage/privacy review.

**Prepared, not executed.** No new live DB/RPC probe or reconciliation observation occurred. Original time-aligned SQL is not restorable from archived artifacts; a fresh campaign is a new observational follow-up, not a paired replay. Current live availability was not tested and is not asserted unavailable. Execution requires explicitly injected evaluation credentials and historical RPC access. Source is currently uncommitted: the recorded HEAD is the base, while SHA-256 plus saved patch identify the correction. No post-fix commit identifier was fabricated.

## Impact on manuscript Tables 6/10 and abstract

Keep original measured distributions labelled by version/pin policy. Do not infer a post-C7 39-case distribution or pool seven targeted rechecks with the other 32 cases. Distinguish six status-alias errors from the assignment disagreement and missing outcome data wherever Tables 6/10 present reconciliation/fault findings; numbering must be checked against the current manuscript. No manuscript source was edited.

C7 supports a locally validated implementation correction: 50 targeted cases, 117 relevant Nest cases (overlapping denominator), 19 adapter cases. These are software regressions, not population accuracy or formal security proof. The abstract may describe explicit unresolved/lag classifications, but cannot claim zero false positives, corrected 39-proposal accuracy, deployment or elimination of the assignment inconsistency.

## Remaining limitations

No deployment, live repair, production migration, credential rotation or transaction occurred. Local contract source/ABI semantics were inspected; deployed bytecode equivalence was not newly established. Indexer name/version use current defaults and require deliberate updates if architecture changes. Null checkpoint hashes weaken reorganization attribution. Production verification is not an atomic SQL snapshot; the evaluation harness freezes SQL explicitly. Exact event-delta explanations classify uncertainty rather than exclusive cause. Full type checking and lint remain nonclean as disclosed. C1-C6 were preserved; this task does not claim a fresh comprehensive security audit.

## Historical provenance verification

All files checked against the earlier Springer provenance list are unchanged from Git HEAD (line-ending normalized). Two report hashes in that old list were already stale at HEAD: `SPRINGER_EXPERIMENTAL_RESULTS.md` and `springer/EVIDENCE_TO_CLAIMS.md`. Raw results/configurations and other listed artifacts match their archived hashes. Neither report was changed in C7; the discrepancy is preserved and recorded in the new manifest, not repaired by rewriting historical provenance.
