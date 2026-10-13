# Postman governance workflow

## Start the API

From the repository root:

```powershell
npm run build
npm run start:dev --workspace=api
```

Import `DAO-Platform.postman_collection.json` into Postman. Run requests 1
through 8 in order. The create request stores the proposal ID as a collection
variable. Request 2 automatically sets voting to start five minutes later and
end one hour after that. Complete publishing and member assignment during
those five minutes, then wait until voting starts before running request 8.

## Development authentication

Administrator write requests require `x-wallet-address` with the configured
DAO administrator address. Proposal creation also requires a unique
`idempotency-key`.

This header bypass works only with `DEV_AUTH_BYPASS_ENABLED=true` outside
production. It is a development convenience, not production authentication.

## On-chain behavior

Creating a proposal persists a `DRAFT` and returns an unsigned transaction
preview. Publishing submits the real transaction using the administrator
signing configuration in `.env`, waits for confirmation, stores the on-chain
proposal ID, and records the receipt in SQLite. Member assignment and
unassignment follow the same confirmed on-chain workflow.

## Member wallet voting

Request 8 returns `chainId`, `from`, `to`, `data`, and `value`. These are an
unsigned transaction; the backend does not possess or use the member's private
key. Send those fields with the connected wallet (for example MetaMask's
`eth_sendTransaction`) and copy the returned transaction hash into the
collection variable `voteTransactionHash`.

Then run request 9. The API reads the receipt from CyberChain and accepts it
only if it succeeded and contains a `VoteCast` event for the same proposal,
member wallet, and option. Request 10 reads indexed votes from SQLite. Request
11 triggers incremental synchronization manually; the API also runs the vote
indexer every 30 seconds. Request 12 can unassign a member only before voting
starts.

The indexer scans at most `VOTE_INDEXER_BLOCK_RANGE` blocks per RPC request
(default `1000`) and persists its cursor after every batch. Reduce this value
if your RPC provider enforces a smaller range.

Example browser wallet call using the response from request 8:

```javascript
const prepared = await prepareResponse.json();
const transactionHash = await window.ethereum.request({
  method: "eth_sendTransaction",
  params: [
    {
      from: prepared.from,
      to: prepared.to,
      data: prepared.data,
      value: "0x0",
    },
  ],
});
```

Use a voting start time that is still in the future. Replace the sample
metadata URI and hash with real content-addressed metadata for production.

## Inspect SQLite

The database file is `data/dao.db`. Print its records with:

```powershell
npm run db:inspect --workspace=@dao-platform/database
```

You can also open it in a SQLite GUI and inspect `proposals`,
`proposal_options`, `proposal_assignments`, `votes`, `chain_transactions`,
`indexer_state`, and `kysely_migration`.

Never commit `.env`; it contains administrator signing material.
