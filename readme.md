# CyberDAO Platform

CyberDAO Platform is a full-stack governance application for CyberChain. It
combines a CyberChain smart contract with a NestJS REST API, a Next.js DApp,
SQLite persistence, and a blockchain event indexer.

The blockchain is the source of truth for governance authorization and voting.
SQLite is the indexed read model used for fast screens, reporting, transaction
history, and synchronization state.

## Project purpose

The project demonstrates a maintainable DAO workflow in which:

- an administrator creates and publishes governance proposals;
- eligible member wallets are assigned to individual proposals;
- assigned members sign their own votes with MetaMask or CyberChain Wallet;
- proposals, assignments, votes, and lifecycle actions are recorded on-chain;
- confirmed transactions and events are indexed into SQLite;
- the DApp reads indexed data instead of repeatedly querying the blockchain.

It uses clean architecture so domain and application rules do not depend on
NestJS, SQLite, Next.js, or the CyberChain SDK.

## Main use cases

### Administrator

- Connect the configured DAO administrator wallet.
- Create a proposal with its title, purpose, description, type, voting period,
  voting options, and initial eligible members.
- Publish the proposal to CyberChain.
- Assign or remove members before voting starts.
- Vote when the administrator wallet is also an assigned member.
- Cancel a proposal or finalize its result where the contract permits it.
- Review proposal transactions and audit history.
- Run an incremental blockchain synchronization into SQLite.

### Member

- Connect a real wallet without sharing its private key with the API.
- View assigned and active proposals.
- Select an option and sign the vote transaction in the wallet.
- Prevent duplicate votes through both application and contract validation.
- View confirmed voting history, totals, and transaction hashes.

### Synchronization and indexing

- Confirm wallet-submitted vote receipts.
- Scan `VoteCast` events in RPC-safe block ranges.
- Persist votes and chain transactions idempotently.
- Resume incremental indexing from the last successful block.
- Run automatically on an interval or manually from the admin dashboard/API.

## Technology

- Node.js 20 or newer and npm workspaces
- TypeScript
- NestJS with Fastify for the API
- Next.js App Router and React for the DApp
- SQLite, Kysely, and `better-sqlite3`
- Solidity and OpenZeppelin
- `@cyberchain/smart-contract-wrapper`
- CyberChain Wallet and MetaMask adapters

## Repository structure

```text
dao-platform/
|-- apps/
|   |-- api/                         NestJS REST API and background indexer
|   `-- web/                         Next.js governance DApp
|-- packages/
|   |-- domain/                      Entities, value objects, and business rules
|   |-- application/                 Use cases and infrastructure ports
|   |-- blockchain-cyberchain/       CyberChain SDK gateway and deployment script
|   |-- contracts/                   Solidity source, compiler, tests, and artifact
|   `-- database/                    SQLite migrations and repositories
|-- data/                            Local SQLite database (generated)
|-- deployments/                     Verified deployment metadata
|-- docs/                            ADRs, security notes, and Postman collection
|-- scripts/                         Environment migration utilities
|-- .env.example                     Backend configuration template
`-- package.json                     Workspace commands
```

## Deployed governance contract

The current governance contract is deployed on CyberChain network `1212`.

```text
Contract: CyberDAOGovernance
Address:  0x51b43885899bd0301c2beea89addc9d876145d21
Block:    15463875
Owner:    0xb8163f7d6d404f67a400743b90f7952d2d137b8e
```

Deployment evidence is stored in
`deployments/cyber-dao-governance-1212.json`. Contract scope and limitations
are documented in `docs/adr/0001-governance-contract-v1.md`.

## Prerequisites

Install the following before running the project:

1. Node.js 20 or newer.
2. npm 10 or newer.
3. Git.
4. VS Code or another editor.
5. CyberChain Wallet for mixed ECDSA/ML-DSA transactions, or MetaMask for a
   compatible EVM account.
6. Access to a CyberChain RPC node.

Check the local versions:

```powershell
node --version
npm --version
git --version
```

## Installation

Open PowerShell in the repository directory:

```powershell
cd E:\DAO\cyber-chain-work\dao-platform
npm install
```

Create the backend environment file:

```powershell
Copy-Item .env.example .env
```

Optionally create a frontend override file:

```powershell
Copy-Item apps\web\.env.example apps\web\.env.local
```

Never commit `.env`, `.env.local`, private keys, seed phrases, or exported
CyberChain wallet material.

## Backend configuration

Edit the root `.env` file. The required variables are:

| Variable | Purpose | Local example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | REST API port | `3000` |
| `DATABASE_URL` | SQLite database URL | `file:./data/dao.db` |
| `CYBERCHAIN_RPC_URL` | CyberChain JSON-RPC endpoint | `http://cyberchain-bc.bisite.es:8545` |
| `CYBERCHAIN_CHAIN_ID` | CyberChain network/chain ID | `1212` |
| `GOVERNANCE_CONTRACT_ADDRESS` | Deployed governance contract | `0x51b43885899bd0301c2beea89addc9d876145d21` |
| `GOVERNANCE_DEPLOYMENT_BLOCK` | First block the indexer may scan | `15463875` |
| `DAO_ADMIN_ADDRESS` | Wallet allowed to use application admin endpoints | Your admin address |
| `DEV_AUTH_BYPASS_ENABLED` | Enables `x-wallet-address` development auth | `true` locally only |
| `VOTE_INDEXER_ENABLED` | Enables scheduled vote indexing | `true` |
| `VOTE_INDEXER_INTERVAL_MS` | Indexer interval | `30000` |
| `VOTE_INDEXER_BLOCK_RANGE` | Maximum blocks per RPC log request | `1000` |
| `SIGN_MODE` | Backend signing algorithm | `ec-dsa` or `ml-dsa` |
| `ECDSA_PRIVATE_KEY` | Backend signer ECDSA private key | Secret; never commit |
| `MLDSA_PUBLIC_KEY` | Complementary ML-DSA public key | Secret configuration |
| `MLDSA_SECRET_KEY` | Required when signing with ML-DSA | Secret; never commit |
| `MLDSA_LEVEL` | ML-DSA security level | `44`, `65`, or `87` |
| `EXPECTED_SENDER_ADDRESS` | Safety check for the derived backend signer | Derived mixed address |
| `JWT_SECRET` | Future/production authentication secret | Long random secret |

The private keys in `.env` are used only by the backend service for the
currently server-submitted administrator contract operations. Member votes are
prepared by the API and signed directly in the member's browser wallet.

## Frontend configuration

The frontend runs with repository defaults. Use `apps/web/.env.local` only to
override them.

| Variable | Purpose | Default |
|---|---|---|
| `DAO_API_ORIGIN` | Server-side Next.js proxy target | `http://localhost:3000` |
| `NEXT_PUBLIC_CYBERCHAIN_RPC_URL` | Wallet/network RPC URL | CyberChain RPC URL |
| `NEXT_PUBLIC_CYBERCHAIN_CHAIN_ID` | Expected chain ID | `1212` |
| `NEXT_PUBLIC_CYBERCHAIN_NAME` | Displayed network name | `CyberChain` |
| `NEXT_PUBLIC_CYBERCHAIN_CURRENCY_SYMBOL` | Native token symbol | `CYBER` |
| `NEXT_PUBLIC_DAO_ADMIN_ADDRESS` | Address displayed as Admin in the DApp | Same as `DAO_ADMIN_ADDRESS` |

The frontend and backend administrator addresses must match. Restart both
processes after changing environment variables.

## Permission model

Three permissions are independent:

1. **DAO application admin** — configured with `DAO_ADMIN_ADDRESS`.
2. **CyberChain network role** — for example `READER`, `WRITER`, `DEPLOYER`,
   `ROLE_MANAGER`, or `ADMIN`.
3. **Smart-contract owner** — stored by the deployed `Ownable2Step` contract.

A wallet can appear as Admin in the DApp but still be unable to send a
transaction when its CyberChain role is only `READER`. A voting wallet needs a
transaction-capable network role, must be assigned to the proposal, and must
vote during the active period.

## Database setup

Run the migrations from the repository root:

```powershell
npm run db:migrate --workspace=@dao-platform/database
```

The default database is created at `data/dao.db`.

## Run the project

Use two VS Code terminals from the repository root.

Terminal 1 — start the API and background indexer:

```powershell
npm run dev:api
```

Terminal 2 — start the Next.js DApp:

```powershell
npm run dev:web
```

Open:

```text
Frontend: http://localhost:3001
API:      http://localhost:3000/v1
Health:   http://localhost:3000/v1/health
```

The browser first displays the wallet connection screen. The governance
dashboard is shown only after a wallet is connected. The selected wallet type
is remembered and restored after refresh while the extension remains unlocked.

## Governance workflow

1. Connect the configured administrator wallet.
2. Open **Proposals**.
3. Enter proposal details, two to ten voting options, a future voting period,
   and initial member addresses.
4. Select **Create, publish & assign members**.
5. The API saves a draft, publishes the proposal, waits for confirmation, and
   assigns the members on-chain.
6. Disconnect the administrator and connect an assigned member wallet.
7. Open the active proposal, choose an option, and approve the wallet signing
   request.
8. The DApp submits the raw transaction and polls the API for confirmation.
9. A successful `VoteCast` event is persisted in `votes` and
   `chain_transactions` and becomes visible in **Votes** and **My Votes**.
10. The administrator can select **Sync blockchain data** to run an incremental
    event scan manually.

Voting start time must be in the future when publishing. Member assignments
must be completed before voting starts. An administrator can vote only when the
administrator wallet is also assigned as a member.

## On-chain and off-chain data

For new proposals, the DApp creates a versioned JSON metadata document
containing the complete proposal text and option labels. It stores the encoded
metadata URI and its SHA-256 hash in the contract. The contract separately
stores or emits:

- proposal type, option count, start time, and end time;
- member assignment and removal events;
- voter address, proposal ID, and selected option;
- cancellation and finalization results.

SQLite stores the query-friendly representation, confirmed transaction
receipts, event-derived votes, and the indexer cursor. Older test proposals
that used placeholder metadata such as `ipfs://replace-with-real-cid` cannot be
fully reconstructed from that placeholder.

## REST API and Postman

Import:

```text
docs/postman/DAO-Platform.postman_collection.json
```

The detailed Postman sequence is documented in `docs/postman/README.md`.
Direct API routes use the `/v1` prefix. The Next.js frontend exposes the same
API through its same-origin `/api/v1` proxy.

Development write requests use `x-wallet-address`. Proposal creation also
requires a unique `idempotency-key`. This bypass is intentionally disabled in
production; production requires nonce-based wallet signature authentication.

## Inspect SQLite

Print proposals, options, assignments, votes, transactions, and indexer state:

```powershell
npm run db:inspect --workspace=@dao-platform/database
```

You can also install a VS Code SQLite extension and open `data/dao.db`. Useful
tables include:

- `proposals`
- `proposal_options`
- `proposal_assignments`
- `votes`
- `chain_transactions`
- `indexer_state`
- `kysely_migration`

## Build and test

Run the complete build:

```powershell
npm run build
```

Run available tests across all workspaces:

```powershell
npm test
```

Additional quality checks:

```powershell
npm run typecheck
npm run lint
```

Contract-only commands:

```powershell
npm run build --workspace=@dao-platform/contracts
npm run test --workspace=@dao-platform/contracts
```

## Deploy a governance contract

Configure the deployment variables in the protected root `.env`, then run:

```powershell
npm run deploy:governance --workspace=@dao-platform/blockchain-cyberchain
```

The deployment script derives and verifies the sender, submits the bytecode,
checks the resulting owner, writes deployment evidence under `deployments/`,
and updates the local contract address. Treat deployment as a production
operation and verify the RPC URL, network ID, sender, and funding first.

## Current contract limitations

Governance contract v1 records proposals, eligibility, ballots, cancellation,
and results. It intentionally does not:

- execute arbitrary treasury calls;
- maintain a global member registry;
- grant CyberChain network roles;
- replace production wallet-signature authentication;
- provide decentralized file pinning by itself.

These boundaries are displayed by the DApp instead of being simulated with
mock behavior.

## Security notes

- Never commit environment files or wallet secrets.
- Do not expose the backend signing key to the frontend.
- Keep `DEV_AUTH_BYPASS_ENABLED=false` in production.
- Use HTTPS and nonce-based wallet signature authentication in production.
- Grant only the minimum required CyberChain network role.
- Back up SQLite during development and migrate to PostgreSQL before running
  multiple API/worker replicas.
- Review `docs/security/dependency-risk-register.md` before deployment.
