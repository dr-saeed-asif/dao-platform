# C6 — CyberChain RPC relay restrictions

## Original vulnerability and root cause

The Next.js route relayed six methods, including `eth_sendRawTransaction`, without checking a wallet session, transaction permissions, request sizes or rate limits. It accepted an incomplete JSON-RPC envelope, replaced the caller's ID and selected a hard-coded HTTP node when configuration was absent. An isolated replay of the route from repository HEAD returned HTTP 200 for an anonymous submission with a mocked blockchain upstream.

Two frontend components call the relay. The native wallet adapter uses chain ID, network role, nonce and raw transaction submission. The transaction decoder reads transaction and receipt records. The injected Ethereum wallet submits through its selected provider instead of this application relay. Nest blockchain verification and governance services use their configured SDK connection directly. No additional relay callers were found in the inspected repositories.

The existing wallet session is issued by `AssistantAuthService` after wallet challenge verification and is protected by the C2 session MAC and expiry checks. Browser sessions are held in module memory. Existing public decoder reads require no wallet proof. No shared rate-limit service was present. PostgreSQL is the existing shared infrastructure.

## Access matrix and authorization

| Method | Access | Required parameters |
|---|---|---|
| `eth_chainId` | Public read | Empty array |
| `eth_getRole` | Public read | Address and allowed block tag/quantity |
| `eth_getTransactionCount` | Public read | Address and allowed block tag/quantity |
| `eth_getTransactionByHash` | Public read | One 32-byte transaction hash |
| `eth_getTransactionReceipt` | Public read | One 32-byte transaction hash |
| `eth_sendRawTransaction` | Valid wallet session plus authorized governance vote | One bounded signed transaction |
| Every other method | Denied | Includes unlocked-account submission, personal/admin/debug methods and unnecessary `eth_call` |

The Next route now proxies only to the fixed Nest path `/v1/cyberchain/rpc`. Nest performs the same checks for direct callers, so bypassing Next cannot bypass submission policy. A supplied invalid or expired session is rejected even on a read. Plain wallet headers provide no authorization.

Submission verifies the CyberChain signature and matches its sender to the authenticated wallet. It requires the configured chain, governance contract, zero value and exact `vote(uint256,uint16)` calldata. It then checks the contract-scoped local proposal, allowed status, voting window, current active assignment, existing option and absence of a stored vote. Contract enforcement remains authoritative for chain state and concurrent submissions. SQL state can lag and can reject a vote that would be valid on chain. The current frontend submits votes through this relay. Owner operations use their existing server-side workflows. ECDSA and ML-DSA wallet submissions have passing fixtures.

The native wallet adapter obtains its existing offline wallet session before relay preflight reads and submission. Its signing flow and configured network checks remain in place. The decoder and wallet now send explicit JSON-RPC 2.0 envelopes and request IDs. C1 receipt handling, C2 authentication, C4 delegation and C5 database roles remain separate controls.

## Shared limits and request handling

| Budget | Fixed database minute |
|---|---:|
| Anonymous reads, shared across anonymous callers | 120 calls |
| Authenticated reads, per normalized wallet | 240 calls |
| All reads across the deployment | 1,000 calls |
| Submission attempts, per wallet | 10 calls |
| All submission attempts across the deployment | 100 calls |

Migration `010_rpc_rate_limits` creates the shared counter table and expiry index. `consumeRpcBudget` uses atomic PostgreSQL upserts inside one transaction for wallet/anonymous and global budgets. Every batch item is charged. A failed reservation rolls back its partial counters. Authenticated submission attempts consume budget before expensive signature and proposal checks. Storage failure denies relay access with HTTP 503. HTTP 429 includes `Retry-After: 60`. Only actor hashes are stored. The design avoids trusting caller-supplied forwarding/IP headers. Anonymous callers share a quota and can exhaust each other's allowance. Fixed-minute boundaries permit bursts across adjacent windows. An edge limiter remains outside the evaluated controls.

Bodies are limited to 65,536 bytes. Next counts streamed bytes, checks declared length, bounds body collection at five seconds, rejects malformed JSON and enforces JSON content type and same-origin browser requests. The Fastify route also has a 65,536-byte parser limit. It rejects invalid JSON before controller processing. Production origin policy is configured in Nest. Browser submission uses an explicit bearer header and no ambient authentication cookie. Origin checking supplements authentication and does not authenticate non-browser clients.

Requests require JSON-RPC `2.0`, a bounded string, safe integer or null ID, a permitted method and positional string parameters. This application interface requires reply-bearing requests and rejects notifications. Batches contain at most ten items. A syntax, method or authorization failure denies the whole batch before blockchain forwarding. After admission, calls execute independently. A later upstream error cannot roll back an earlier broadcast, and per-call results/errors retain their IDs. Sensitive upstream error text/data are replaced with fixed messages. Redirects are rejected, each blockchain fetch has a ten-second timeout and each response is capped at 1 MiB.

## Configuration and files

Both hard-coded node fallbacks were removed from the relay and injected-wallet chain-add path. Nest requires `CYBERCHAIN_RPC_URL` and uses HTTPS in production. Credential-bearing userinfo URLs are rejected. Server-only node URLs can contain provider API-key paths or queries, which are never included in relay error messages. The optional `NEXT_PUBLIC_CYBERCHAIN_RPC_URL` used for wallet chain installation must be a public, credential-free endpoint and HTTPS in production.

Production also requires an explicit HTTPS `DAO_API_ORIGIN` in Next and exact `RPC_WEB_ORIGIN` in Nest. Development supports an explicitly configured HTTP node and a local Nest gateway. The existing C2 `JWT_SECRET` protects the wallet session. No new service signing secret was added.

| Area | Modified or added paths |
|---|---|
| Next relay | `apps/web/src/app/api/cyberchain/rpc/route.ts` |
| Frontend callers | `apps/web/src/lib/wallet/cyberchain-wallet.ts`, `apps/web/src/lib/wallet/injected-wallet.ts`, `apps/web/src/lib/api/assistant.ts`, `apps/web/src/features/decoder/transaction-decoder.tsx` |
| Nest policy and endpoint | `apps/api/src/rpc/rpc-policy.ts`, `rpc-budget.ts`, `rpc.controller.ts`, `apps/api/src/ai/ai.module.ts`, `apps/api/src/configure-app.ts`, `apps/api/src/config/env.validation.ts` |
| Shared storage | `packages/database/src/postgres-migrations/rpc-rate-limits.migration.ts`, `packages/database/src/postgres-database.ts` |
| Configuration examples | `.env.example`, `apps/web/.env.example` |
| Tests | `apps/api/src/rpc/rpc.controller.spec.ts`, `apps/web/tests/rpc-route.test.mts`, `scripts/security/c6-rate-limit.test.cjs` |

## Commands and actual results

| Executed validation | Result |
|---|---|
| Archived HEAD route invoked through TypeScript transpilation with global fetch mocked | Reproduced anonymous raw-transaction relay, HTTP 200. No network submission. |
| `node ../../node_modules/jest/bin/jest.js --runInBand rpc.controller.spec.ts assistant.spec.ts ai.controller.spec.ts env.validation.spec.ts postgres.service.spec.ts blockchain-verification.spec.ts` from `apps/api` | 86 passed across six suites, including 42 C6 checks. The C6 suite passed again after fixture type cleanup. |
| `node --experimental-strip-types --test apps/web/tests/rpc-route.test.mts` from repository root | 8 passed. Mocked Nest gateway only. Node emitted experimental type-stripping/module-format warnings. |
| `node --test scripts/security/c6-rate-limit.test.cjs` | 5 passed using a fresh loopback-only `postgres:17-alpine` container. Two separate pools shared counters. Exactly 10 of 30 concurrent submission reservations succeeded and 20 returned 429. Batch accounting, transactional rollback, anonymous/authenticated limits, global limits and storage failure passed. Container removed afterward. |
| `node node_modules/typescript/bin/tsc -b packages/database/tsconfig.json` | Passed. |
| `tsc --noEmit -p apps/api/tsconfig.build.json` and web `tsconfig.json` | Passed. |
| Full API `tsconfig.json` | Still fails on the two previously recorded transaction-fixture type errors in untouched `assistant-cyberchain.spec.ts`. New C6 fixture type errors were corrected. |
| API ESLint on `src/rpc` and `src/configure-app.ts`, web ESLint on all five modified source files | Passed using each workspace's own ESLint configuration. An initial repository-root ESLint invocation had no configuration and was rerun from the correct workspace. |
| Web `npm run build` | Next.js 16.2.10 production build and TypeScript checks passed. The earlier command with `--webpack` was interpreted by npm as configuration and still ran Turbopack. The final build used plain `npm run build`. |

Security cases cover anonymous, invalid and expired sessions, valid authorized submission, unauthorized membership/options/state, wrong network/contract/value/calldata, unsupported methods, malformed envelopes/JSON, declared and streamed oversize, mixed batches, 429, configuration failure, production HTTP rejection, origin checks, redirection/network failure, sanitized provider errors and a stalled upstream aborted at its budget. The registered Fastify route was exercised with request injection. All blockchain fetches were mocked. The tests also exposed and corrected a cross-realm timeout error-classification issue. Early signing-fixture failures used the wrong gas price for the offline proof and were corrected without changing the authentication service.

## Deployment, rollback and remaining limits

Apply migration 010 through the existing administrative Kysely migration workflow with the approved migration owner. It grants SELECT/INSERT/UPDATE/DELETE on only `public.rpc_rate_limits` to `cyberdao_dao_runtime` when that role exists. If roles are provisioned after this migration, the owner must explicitly grant those four permissions on this table before cutover. The AI login receives no new grants. Nest runtime performs no migration at startup under C5. Configure the URLs, origin and existing wallet-session settings, then switch the frontend and backend together. Validate storage and read-only access before enabling submission traffic. These changes and builds were local. No production migration, credential change, deployment or blockchain transaction was executed.

For operational rollback, disable the relay and deploy a fail-closed handler while reviewing the fault. Keep the harmless rate-counter table in place. Do not restore the anonymous submission handler as a rollback. If an approved schema rollback is required, use the Kysely down migration with correct migration-history bookkeeping after traffic stops. The down migration drops only the counter table and index. Other security findings' data and roles must remain intact.

Database-backed request admission was tested against real concurrent pools. Full production deployment, TLS termination, synchronized clocks, wallet extension interaction and load behavior remain deployment checks. Blockchain tests validated signed fixture parsing with mocked upstreams. The two existing full-project test type errors remain outside C6. The public blockchain can also be accessed directly through externally configured wallets or nodes. This fix controls use of the CyberDAO relay.
