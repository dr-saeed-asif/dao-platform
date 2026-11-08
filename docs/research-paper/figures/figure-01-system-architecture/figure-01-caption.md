# Figure 1 caption

## Caption (for the manuscript)

**Fig. 1.** Overall architecture of the CogitX/CyberDAO platform. (A) Administrators and members use a Next.js
governance DApp with two wallet paths. CyberChain Wallet signs a transaction and returns it as a raw
transaction, which the DApp sends through a server-side RPC proxy limited to six allowlisted methods.
MetaMask signs and broadcasts the transaction itself (`eth_sendTransaction`) through its own configured RPC.
Wallet sign-in for the AI assistant (dotted) is kept separate from transaction execution. CyberChain Wallet
signs a challenge transaction bound to a dedicated authentication chain ID, and that transaction is never
broadcast. MetaMask signs an EIP-191 message. (B) A NestJS API exposes proposal, voting, artefact and AI
gateway services. A clean-architecture core sits behind it, together with an event indexer and a CyberChain
gateway whose backend administrator signer uses ECDSA or ML-DSA. (C) The CyberDAOGovernance contract on
CyberChain (chain ID 1212) is the authority for proposals, member assignment, one-vote-per-wallet voting,
finalization and governance events. (D) A FastAPI service runs a LangGraph workflow. A question planner and a
*deterministic*, rule-based supervisor route each task to up to six specialist agents. The agents call
in-process tools under a per-agent allowlist. A verification node checks citations and monetary amounts
before one synthesis step, and all inference runs on local Ollama models. The blockchain agent obtains
on-chain evidence only through a read-only, token-authenticated verification endpoint of the DAO API.
(E) One PostgreSQL/pgvector database holds the indexed DAO read model (`public`) and the AI data (`ai`).
Verified proposal PDFs are kept in a shared local artefact store. (F) A stand-alone MCP server (stdio,
read-only) offers the same data to local operator tools. It is not part of the agent execution path.
Circled numbers refer to the interface key in the notation panel.

## Short caption (if the journal limits caption length)

**Fig. 1.** CogitX/CyberDAO system architecture: wallet layer with separate CyberChain Wallet and MetaMask
transaction paths, NestJS governance API, CyberChain governance contract, deterministic-routing multi-agent
AI service with local LLM inference, and shared PostgreSQL/pgvector storage.

## Interface key (matches the numbers in the figure)

| No. | From → to | Protocol / authentication |
|---|---|---|
| 1 | Next.js RPC proxy → CyberChain RPC node | JSON-RPC; only `eth_chainId`, `eth_getRole`, `eth_getTransactionCount`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_sendRawTransaction` |
| 2 | CyberChain gateway → RPC node | `@cyberchain/smart-contract-wrapper`: administrator transactions signed in the backend (ECDSA or ML-DSA, `SIGN_MODE`), receipts, event logs |
| 3 | Blockchain verification service → RPC node | read-only `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_call`, `eth_getLogs`, `eth_getTransactionReceipt`, `eth_getTransactionByHash` |
| 4 | AI assistant gateway ↔ FastAPI | HTTP + Server-Sent Events; `Authorization: Bearer AI_SERVER_TOKEN`; `X-DAO-User` (wallet already authenticated by Nest) |
| 5 | Research & artefacts → FastAPI | multipart `POST /rag/upload-pdf`; Bearer token; loopback hosts only |
| 6 | Blockchain agent → verification service | `GET /v1/ai/internal/proposals/{id}/verification?dao_id=`; Bearer token; response scope re-checked |
| 7 | LangGraph workers / synthesis → Ollama | HTTP `/api/chat` (embeddings use `/api/embed` from the RAG component) |
| 8 | MCP server → PostgreSQL | psycopg, read-only queries; MCP itself is reached over stdio with an operator token |

## Layout note

The master is laid out at 1360 × 1246 units for a full-width (double-column, `figure*`) placement of about
18 cm. Body text is then about 5.5 pt, which is near the lower limit; for IEEE, either place it as a
full-page figure or use the simplified single-column variant (to be prepared on request). Internal workflows
(agent loop, vote sequence, RAG pipeline, verification algorithm) are deliberately summarised here and
expanded in later figures.
