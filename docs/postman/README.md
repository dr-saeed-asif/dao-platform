# Postman proposal workflow

## Start the API

From the repository root:

```powershell
npm run build
npm run start:dev --workspace=apps/api
```

Import `DAO-Platform.postman_collection.json` into Postman and run the requests
in numerical order. The create request stores its returned proposal ID as a
collection variable for the detail request.

## Development authentication

`POST /v1/proposals` requires these headers:

- `idempotency-key`: a unique value for one logical request;
- `x-wallet-address`: the configured DAO administrator address.

The wallet header is enabled only when `DEV_AUTH_BYPASS_ENABLED=true` and
`NODE_ENV` is not `production`. It is a Postman development convenience, not
production authentication.

## Response meaning

Creating a proposal persists a `DRAFT` and returns an unsigned CyberChain
transaction containing `chainId`, `from`, `to`, `data`, and `value`. The draft
is not yet on-chain. A real wallet must review and sign this transaction, after
which a transaction-submission and receipt-tracking workflow will be added.

Use a voting start time that is still in the future when the transaction is
eventually submitted. Replace the sample metadata URI and hash with real,
content-addressed metadata before an actual on-chain proposal.

## Inspect SQLite

The database file is:

```text
data/dao.db
```

Print its proposal and option rows with:

```powershell
npm run db:inspect --workspace=@dao-platform/database
```

You can also open `data/dao.db` in a SQLite GUI and inspect the `proposals`,
`proposal_options`, and `kysely_migration` tables.
