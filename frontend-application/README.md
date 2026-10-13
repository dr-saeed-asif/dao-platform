# Governance frontend application

Next.js screens, proposal/voting/member interfaces, wallet integration and saved research answers.

Run from repository root:

```powershell
npm.cmd run dev:frontend
```

The frontend uses port 3001. Set DAO_API_ORIGIN in .env.local to match backend PORT; its default is http://127.0.0.1:3002.

Public routes remain /, /analysis, /ai-assistant/results/[runId] and /api/cyberchain/rpc.
Next.js page.tsx/layout.tsx/route.ts names are conventional; route groups describe purpose without changing URLs.

Browser wallet adapters live in src/blockchain-wallet-integration. Backend requests live in src/backend-communication; public types come from the shared data-contract workspace. Provider credentials remain server-side.

See [architecture](../project-documentation/architecture.md).
