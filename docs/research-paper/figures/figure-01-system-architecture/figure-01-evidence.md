# Figure 1 – source evidence

Repositories inspected read-only on 7 Nov 2026:

- **DP** = `E:\DAO\cyber-chain-work\dao-platform`
- **AI** = `E:\DAO\cyber-chain-work\api-ai-server1\api-ai-server`

No application code was changed.

## 1. Wallet architecture (re-examined)

| Question | Finding | Evidence |
|---|---|---|
| How CyberChain Wallet connects to the DApp | Through the extension object `window.CyberChainWallet`: `connect()`, `requestWalletAddress()`, `sign(tx)`, `lock()`, optional `watchWalletAddress()`. It does **not** use EIP-1193. | DP `apps/web/src/lib/wallet/cyberchain-wallet.ts` (`CyberChainWalletProvider`, `CyberChainWalletAdapter.connect/restore/disconnect`) |
| How it creates and signs raw transactions | The API prepares the call (`PrepareVoteUseCase` → `CyberChainGovernanceGateway.prepareVote` → `encodeMutableMethod("vote", …)`, returning `{chainId, from, to, data, value}`). Before signing, the DApp checks that the account matches, reads `eth_getRole` (refuses `READER`), the pending nonce (`eth_getTransactionCount`) and `eth_chainId` (must equal the prepared chain). It then calls `provider.sign({to, data, chainId, nonce})`, and the extension returns a **signed raw transaction**. | DP `cyberchain-wallet.ts` (`submit`); `packages/application/src/voting/prepare-vote.use-case.ts`; `packages/blockchain-cyberchain/src/cyberchain-governance.gateway.ts` (`prepareVote`) |
| How signed transactions reach the CyberChain RPC | The DApp posts `eth_sendRawTransaction` to the same-origin Next.js route `/api/cyberchain/rpc`. That route forwards only six allowlisted methods to `CYBERCHAIN_RPC_URL`. | DP `cyberchain-wallet.ts` (`rpc()`); `apps/web/src/app/api/cyberchain/rpc/route.ts` (`allowed`) |
| How MetaMask differs | MetaMask uses the EIP-1193 `window.ethereum` provider. It switches or adds the CyberChain network (`wallet_switchEthereumChain` / `wallet_addEthereumChain`), then calls `eth_sendTransaction`, so **MetaMask signs and broadcasts** through its own configured RPC URL (`NEXT_PUBLIC_CYBERCHAIN_RPC_URL`), not through the Next.js proxy. Its error message notes that mixed-signature transactions may need a compatible wallet. | DP `apps/web/src/lib/wallet/injected-wallet.ts` (`ensureCyberChain`, `submitPreparedTransaction`, `MetaMaskWalletAdapter`) |
| How receipts are processed | Both paths return a transaction hash. `voting-panel.tsx` polls `POST /v1/proposals/:id/votes/confirm` up to 20 times, every 3 s. `ConfirmVoteUseCase` calls `getConfirmedVote` → `Web3RPCClient.getTransactionReceipt`, requires `status = 1`, decodes `VoteCast`, and records the vote and chain transaction in one DB transaction. If confirmation is still pending, the background indexer (`SyncGovernanceUseCase`, `eth_getLogs`) records it later. | DP `apps/web/src/features/voting/voting-panel.tsx` (`castVote`); `packages/application/src/voting/confirm-vote.use-case.ts`; `cyberchain-governance.gateway.ts` (`getConfirmedVote`, `findGovernanceEvents`); `apps/api/src/proposals/voting-indexer.service.ts` |
| How wallet authentication works for the AI assistant | `POST /v1/ai/assistant/auth/challenge` issues a 32-byte nonce valid for 120 s. **CyberChain Wallet:** the backend returns an unsigned transaction whose `data` is the challenge text, with chain ID `0x43594244414f` (a dedicated auth chain), gas 6,000,000 and zero value and fees. The wallet signs it, the DApp submits the signed bytes to `/auth/login`, and the backend decodes it with `@cyberchain/tx`, checks every field and recovers the sender. The proof is never broadcast. **MetaMask:** `signer.signMessage(challenge.message)` (EIP-191) is checked with `ethers.verifyMessage`. Both produce a 30-minute HMAC-SHA256 session token (key `JWT_SECRET`). | DP `apps/web/src/lib/api/assistant.ts` (`authenticateAssistant`); `apps/api/src/ai/assistant-auth.service.ts` (`challenge`, `login`, `user`, `NATIVE_AUTH_CHAIN_ID`) |
| ECDSA / ML-DSA per signing path | **Backend administrator signer:** ECDSA or ML-DSA (levels 44/65/87), selected by `SIGN_MODE`; uses a complementary mixed address. **CyberChain Wallet (browser):** the DApp does not choose or see the algorithm; signing happens inside the external extension. The backend auth verifier (`@cyberchain/tx` 0.2.5, `SignatureCrypto.decode`) accepts ECDSA or ML-DSA 44/65/87 signatures, but the repository does not show which algorithm the extension uses. The figure therefore makes **no** ML-DSA claim for the wallet. **MetaMask:** standard EVM ECDSA (secp256k1). | DP `cyberchain-governance.gateway.ts` (`transactionOptions`, `SignKeyECDSA`/`SignKeyMLDSA`); `apps/api/src/config/env.validation.ts` (`SIGN_MODE`, `MLDSA_LEVEL`); `node_modules/@cyberchain/tx/src/signature.ts` (`SignatureCrypto.decode`) |

## 2. Components shown

| Figure element | Evidence |
|---|---|
| DAO administrator / member | DP `apps/api/src/proposals/configured-owner.authorization.ts` (`DAO_ADMIN_ADDRESS`); `prepare-vote.use-case.ts` (`MEMBER_NOT_ASSIGNED`) |
| Next.js governance DApp (React 19, ethers 6) | DP `apps/web/package.json`; `apps/web/src/features/**` |
| CyberChain RPC proxy (6 methods) | DP `apps/web/src/app/api/cyberchain/rpc/route.ts` |
| API proxy `/api/*` → `/v1/*` | DP `apps/web/next.config.ts` (`rewrites`); `apps/web/src/lib/api/client.ts` (`baseUrl`) |
| NestJS on Fastify, `/v1` | DP `apps/api/src/main.ts`, `app.module.ts` |
| CyberChain gateway | DP `packages/blockchain-cyberchain/src/cyberchain-governance.gateway.ts` (`CyberChainGovernanceGateway`) |
| Proposal services | DP `apps/api/src/proposals/proposals.controller.ts`; `packages/application/src/proposal/**`, `voting/**`, `membership/**` |
| Governance event indexer (30 s) | DP `apps/api/src/proposals/voting-indexer.service.ts`; `packages/application/src/synchronization/sync-governance.use-case.ts` |
| Application core | DP `packages/domain`, `packages/application/src/ports/*` |
| Persistence adapters | DP `packages/database/src/postgres-*.ts`; `apps/api/src/research/local-artefact.storage.ts` |
| AI assistant gateway | DP `apps/api/src/ai/assistant.controller.ts` (`scope`, `upstream`), `assistant-auth.service.ts` |
| Research & artefacts | DP `apps/api/src/research/research.service.ts` (`createManifest`, `link`, `indexLinkedPdfs`), `research.controller.ts` |
| Blockchain verification | DP `apps/api/src/ai/blockchain-verification.service.ts` (`verify`), `blockchain-verification.controller.ts` |
| CyberChain RPC node, chain ID 1212 | DP `deployments/cyber-dao-governance-1212.json`; `.env.example` |
| CyberDAOGovernance (Solidity, `Ownable2Step`, `0x51b4…5d21`) | DP `packages/contracts/contracts/CyberDAOGovernance.sol`; `docs/adr/0001-governance-contract-v1.md` |
| Lifecycle `Pending/Active/Closed/Cancelled` | `CyberDAOGovernance.sol` (`enum ProposalState`, `createProposal`, `cancelProposal`, `finalizeProposal`) |
| Membership | `CyberDAOGovernance.sol` (`assignMembers`, `unassignMember`, `AssignmentLocked`) |
| Voting & finalization | `CyberDAOGovernance.sol` (`vote`: `MemberNotAssigned`, `AlreadyVoted`; `finalizeProposal`: plurality + `tied`) |
| Governance events | `CyberDAOGovernance.sol` (`ProposalCreated`, `MemberAssigned`, `MemberUnassigned`, `VoteCast`, `ProposalCancelled`, `ProposalFinalized`) |
| FastAPI AI server, `/rag/*`, Bearer | AI `app/presentation/main.py`, `api/rag.py`, `dependencies/auth.py` (`require_local_token`) |
| Ollama models | AI `app/model/config/settings.py` |
| Question planner | AI `app/business/agents/question_planner.py` (`plan_question_batch`), `planning.py` (`plan_questions`) |
| Supervisor: deterministic routing | AI `app/business/agents/planning.py` (`classify_intent`, `select_agents`); `workflow.py` (`_supervisor` returns status only; `_route` returns `plan["agent"]`; trace rule `deterministic_intent_classifier`) |
| Six specialist agents | AI `workflow.py` (`_build_graph`), `catalog.py` (`AGENT_TOOLS`) |
| Verify node, retry ≤ 2 | AI `workflow.py` (`_verify`, `_after_verify`), `quality.py` (`verify_citations`), `synthesis.py` (`supported_amounts`), `settings.agent_max_retries` |
| Synthesis | AI `synthesis.py` (`synthesize`); `rag/ollama_client.py` (`compose`, JSON `format`) |
| In-process tools (22, allowlist, cache) | AI `agents/tools.py` (`build_tools`, `TOOL_NAMES` check); `workflow.py` (`_invoke`: allowlist, `_tool_cache`) |
| RAG retrieval (verified PDFs, pgvector, 1024-d) | AI `business/governance/retrieval.py` (`search_proposal`), `governance/evidence.py` (`verified_pdf_record`), `rag/proposal_search.py` |
| PostgreSQL + pgvector; `public` and `ai` schemas | DP `docker-compose.yml`; AI `migrations/001_ai_vector_storage.sql`, `004_conversation_persistence.sql`, `006_agent_observability.sql`; DP `packages/database/src/postgres-migrations/*` |
| Local artefact storage | DP `local-artefact.storage.ts` (`ARTEFACT_STORAGE_DIR`); AI `settings.dao_artefact_storage_dir` |
| MCP server (stdio, 13 read-only tools, operator token) | AI `app/business/mcp/main.py` (`transport="stdio"`), `server.py`, `lifespan.py` (`require_operator_token`), `tool_registry.py` (health + 4 + 4 + 4 tools) |

## 3. Connections shown

| Edge | Evidence |
|---|---|
| DApp ↔ CyberChain Wallet: vote signing | `cyberchain-wallet.ts` (`submit` → `provider.sign`) |
| DApp ↔ CyberChain Wallet: auth proof | `assistant.ts` (`wallet.sign(challenge.transaction)`) |
| DApp ↔ MetaMask: vote | `injected-wallet.ts` (`eth_sendTransaction`) |
| DApp ↔ MetaMask: auth | `assistant.ts` (`signer.signMessage`) |
| DApp → RPC proxy | `cyberchain-wallet.ts` (`rpc()`: `eth_getRole`, `eth_getTransactionCount`, `eth_chainId`, `eth_sendRawTransaction`) |
| MetaMask → RPC node | `injected-wallet.ts` (`wallet_addEthereumChain` `rpcUrls`) |
| DApp → API proxy → Nest | `next.config.ts`; `client.ts`; `assistant.ts` (`/api/v1/ai/assistant`) |
| ① RPC proxy → node | `route.ts` |
| ② Gateway → node | `cyberchain-governance.gateway.ts` (`publishProposal`, `assignMembers`, `cancelProposal`, `finalizeProposal`, `getConfirmedVote`, `findGovernanceEvents`, `latestBlockNumber`) |
| ③ Verification → node | `blockchain-verification.service.ts` (`rpc('eth_call' …)`, `eth_getLogs`, receipts) |
| RPC node → contract | Standard EVM execution of the calls above |
| ④ AI gateway ↔ FastAPI | `assistant.controller.ts` (`upstream`: `Authorization`, `X-DAO-User`; `/rag/agents/ask/stream`); AI `api/agents.py` (`X-DAO-User` header) |
| ⑤ Research → FastAPI | `research.service.ts` (`indexLinkedPdfs`, loopback check); AI `api/documents.py` (`/upload-pdf`) |
| ⑥ Blockchain agent → verification | AI `agents/blockchain.py` (`BlockchainVerificationAgent.snapshot`); DP `blockchain-verification.controller.ts` (`timingSafeEqual`) |
| ⑦ LangGraph → Ollama | AI `workflow.py` (`_chat_with_fallback` → `ollama.chat`); `synthesis.py` |
| Planner → Ollama (optional) | AI `question_planner.py` (`/api/chat`, `qwen3:0.6b`); stated in the planner box, not drawn as an edge |
| RAG → Ollama embeddings | AI `governance/retrieval.py` (`ollama.embed`); stated in the RAG box |
| Persistence → `public` / files | DP `postgres-*.repository.ts`; `local-artefact.storage.ts` (`put`) |
| RAG → `ai` (pgvector) / files | AI `rag/proposal_search.py`; `governance/retrieval.py` (`sync_record` from storage dir) |
| Tools → PostgreSQL | AI `model/database/proposal_queries.py`, `proposal_votes.py`, `proposal_artefacts.py` (read `public.*`); `conversations.py`, `agent_observability.py` (write `ai.*`) |
| ⑧ MCP → PostgreSQL | AI `mcp/lifespan.py` (`create_pool`), tool modules |

## 4. Deliberately not shown (no implementation evidence)

- A2A protocol, agent cards, or agent-to-agent messaging. Agents are LangGraph nodes sharing typed state.
- MCP in the agent path. The agents call the tool functions in the same process (`agents/tools.py` imports `app.business.mcp.*` implementations), and no MCP client exists in the workflow, Nest or the DApp.
- LLM-based supervisor or autonomous tool selection. Routing is rule-based, and each agent runs a fixed tool sequence (`workflow.py` `_execute_tools`).
- ML-DSA signing by browser wallets (not determinable from the repository; see §1).
- Treasury execution, quorum, timelock, IPFS pinning, global member registry (absent by design, ADR 0001).
- Cloud LLM providers. All inference uses local Ollama.
- Production wallet-signature authentication on governance write routes. These currently use the `x-wallet-address` development bypass, so the figure does not claim this protection.

## 5. Validation performed

- Every box and edge above was checked against the cited source.
- The two wallet transaction paths are drawn separately: CyberChain Wallet goes through the RPC proxy, and MetaMask goes through its own RPC. Sign-in is drawn with a separate dotted style.
- `.drawio` was parsed as XML. It has 123 cells (85 vertices, 36 edges including 4 legend samples, 12 containers, 13 edge labels attached to their edges). All IDs are unique, every parent, source and target exists, and every child lies inside its container. Edges use fixed exit/entry points and waypoints, so draw.io reproduces the routing.
- **Limitation:** the draw.io application is not installed in the build environment and has no network access, so the file was validated structurally but not opened in draw.io. Please open it once in draw.io (desktop or diagrams.net) to confirm.
- `.svg` is pure vector: 175 `<text>` elements, no embedded raster images.
- `.png` was rendered from the SVG at 2× (2720 × 2492 px, about 380 dpi at 18 cm width) and inspected visually.
- `.mmd` was rendered with Mermaid CLI without errors. Mermaid computes its own layout, so it is a text-based companion, not the print master.
