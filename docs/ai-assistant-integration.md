# Proposal AI assistant integration

The existing Next.js interface opens the same assistant from Proposal → Ask AI and the AI Assistant navigation item. Requests use `/api/v1/ai/assistant/*` through Next's existing rewrite and NestJS. No browser request goes directly to the operator-authenticated AI service.

## Configuration and rollout

- DAO backend: `AI_SERVER_URL`, `AI_SERVER_TOKEN`, `JWT_SECRET`, `POSTGRES_URL`, `DAO_ADMIN_ADDRESS`. The AI token must match the AI server's `RAG_DEV_TOKEN`. These remain server-side.
- Frontend server: `DAO_API_ORIGIN` (default `http://127.0.0.1:3000`). No AI secrets or AI URL use `NEXT_PUBLIC_*`.
- AI service: apply existing migrations through `004_conversation_persistence.sql`, then `005_conversation_owners.sql`. Migration 005 was applied to the local database during validation. Start `python run_server.py`; it honors `RAG_PORT` and uses Windows' selector event loop.
- Configure installed Ollama chat/fast/embedding models. Validation used `qwen3:4b-instruct` and `qwen3-embedding:0.6b`. No models were downloaded.
- Restart the DAO API and frontend after changes. For remote deployment use TLS and keep the AI operator interface private. No new CORS permissions are required.

## Security and behavior

Existing wallet connections provide the identity selector, not verified authentication. AI sign-in adds a single-use 2-minute wallet challenge and a signed 30-minute session, held in browser memory. Nest checks the configured administrator, proposal creator or current assignment on every request, derives DAO/proposal IDs from PostgreSQL, and forwards the authenticated wallet in `X-DAO-User`. AI conversation reads/listing/continuation filter that owner in PostgreSQL. Conversations predating migration 005 remain under the operator owner; they are not exposed to arbitrary wallets. Legacy Nest query endpoints return HTTP 410, closing their old local-only authorization bypass.

SSE relays real run/question events, complete partial question results and a persisted ordered terminal result. There is no simulated token streaming. Answers and citations survive reopening via message metadata. Failed verification does not display an unverified answer. Conversation context resolves follow-ups but is not itself a citable source. Proposal-scoped research is restricted to the selected proposal.

A connected native CyberChain wallet is reused automatically. The assistant calls `requestWalletAddress()` and the existing `sign()` method for an offline challenge; it never calls `connect()` or requires MetaMask. The proof has zero value and zero fees and is never broadcast. Wallet 1.0.0 hardcodes its gas limit to 6,000,000, so proofs use a dedicated authentication chain ID (ASCII CYBDAO), distinct from the configured DAO network. Signed chain-ID verification prevents replay on the DAO network. Nest verifies native ECDSA or ML-DSA signatures with `@cyberchain/tx`, binds the payload to a single-use expiring nonce and wallet address, and rejects proofs for the DAO network, altered proof fields, fees, value transfers or changed challenges. One wallet signature approval may be required per session; reopening the panel reuses the session. A compatibility adapter reconstructs the legacy EIP-155 signing hash because SDK 0.2.5 drops that capability when decoding signed legacy transactions. Typed proofs use the SDK's normal signing hash.

Native browser regression uses a CyberChain provider transport with real ML-DSA proof verification at the actual DAO backend, verifies zero reconnect calls and one signature across panel reopenings, and isolates history for the generated wallet (which has no DAO assignment). Installed extension approval UI is not automated.

## Validation

- `npm run build`: complete monorepo build (including Next production build).
- `npm run test --workspaces --if-present`: existing workspace regressions and new proxy/authentication tests.
- From `apps/api`: `node ../../node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand`. This now creates and removes an isolated PostgreSQL database instead of testing against the user's DAO records; the DB role needs CREATE DATABASE.
- AI repository: `.venv/Scripts/python.exe -m unittest discover -s tests` (102 tests).
- Browser tests: `npx playwright test --config=apps/web/playwright.config.ts`. Edge is the configured browser. Tests use real PostgreSQL/Ollama/LangGraph, an injected wallet transport with real signatures produced in the Node test runner, and existing `Cyber Testing` (`onchain-28`) data. No private key enters the browser. HTTP 500/timeouts/auth UI errors use deliberate browser fault injection; proxy error mapping is separately unit tested.

For isolated browser validation, start the AI on 8001, run `node scripts/start-assistant-test-api.cjs` (existing API on 127.0.0.1:3004, test-only admin set to the configured local signing key), build the existing web workspace with `DAO_API_ORIGIN=http://127.0.0.1:3004`, and start it with `next start --port 3005`. This launches the same repositories and does not change persisted DAO roles. Stop these temporary processes after testing. Browser tests cover real login, proposal context, single/five/dependent questions, follow-ups, progress, citations, owner/scope denial, history, insufficient evidence and mobile width. Never run the test helper as a production service.

