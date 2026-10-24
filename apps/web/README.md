# CyberDAO web application

The Next.js App Router frontend consumes the DAO API through a same-origin
rewrite. It runs on port `3001`; the API runs on `3000`.

## Run locally

From the repository root, use two terminals:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

Open `http://localhost:3001`.

Copy `apps/web/.env.example` to `apps/web/.env.local` only when you need to
override the defaults. `DAO_API_ORIGIN` is server-side and controls the Next.js
proxy target.

## AI boundary

The dashboard calls `/api/v1/ai/query` and `/api/v1/ai/query/batch` through the
same Next.js rewrite. Browser code never receives `AI_SERVER_TOKEN` and does not
call `api-ai-server` directly. The NestJS API resolves proposal scope and acts
as the only AI proxy.

## Wallet boundary

`src/lib/wallet/injected-wallet.ts` is the only injected-wallet integration.
It checks chain `1212`, requests the exact assigned member account, submits the
prepared transaction, and returns its hash. CyberChain mixed ECDSA/ML-DSA
signing may require a CyberChain-compatible wallet. Replace or extend this
adapter when that wallet SDK is available; feature components do not need to
change.

Two adapters are available:

- `MetaMaskWalletAdapter` uses the injected EIP-1193 provider.
- `CyberChainWalletAdapter` uses the official extension's
  `window.CyberChainWallet` API, requests hybrid signing, and relays only the
  resulting signed raw transaction through the allow-listed server RPC route.

The dashboard provides real proposal, assignment, voting, cancellation,
finalization, indexed-results, and transaction-audit workflows. Contract v1
does not provide global member activation or arbitrary proposal execution, so
the UI reports those capability boundaries instead of simulating them.

The current API uses `x-wallet-address` only in development. Production must
replace it with nonce-based wallet signature authentication.
