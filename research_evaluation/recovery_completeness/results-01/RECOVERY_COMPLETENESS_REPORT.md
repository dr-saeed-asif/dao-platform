# Recovery completeness follow-up

The run is **complete**. The existing CyberDAO recovery use case reconstructed 39/39 original proposals, with 0 additional proposals. PostgreSQL ran in a new database inside the dedicated loopback container. The experiment used block 20325000 on chain 1212, with hash `0x7f5d787551a2ead47dee151434eb86b4fbe08e6d33d2a02c7e4ecf05138cb7be`. Recovery and reconciliation used one RPC provider. No second independently operated endpoint was configured, so cross-provider validation was unavailable.

| Original cohort outcome | Prior recovery | Follow-up |
|---|---:|---:|
| verified | 24 | 39 |
| mismatched | 0 | 0 |
| unverified | 15 | 0 |
| unavailable | 0 | 0 |
| failed | 0 | 0 |
| not_attempted | 0 | 0 |

| Prior outcome | Follow-up outcome | Proposals |
|---|---|---:|
| unverified | verified | 15 |
| verified | verified | 24 |

The recovery pass recorded 110 assignment rows, 30 votes, and 188 governance events. It took 51.896 s, compared with 51.110 s previously. These are single-run timings. C7 attempted 39 proposals at concurrency three, with median per-proposal wall time 13.469 s.

C7 reported scan statuses `{"complete": 39}`. Recovery projected winner and tie fields for 6/6 finalized proposals. C7 compared the recovered fields with pinned contract storage through the same provider. It verified 6 winner and 6 tie comparisons. Non-finalized proposals do not require these fields. Proposal 32 outcome: verified. Its recovered active assignment count is 9.

## Code changes and regression evidence

- C7 processes contiguous 1,000-block pages in ordered windows of eight, bounded to 5,000 pages and 10,000 distinct logs. It checks a 75-second budget before starting each window and retains the SDK's 15-second per-call timeout. The last contiguous completed block and next unchecked block are recorded. Failed pages cannot become covered by later successful responses.
- Log pages reject malformed or out-of-range entries and conflicting duplicates. Accepted logs are deduplicated and ordered by block and log index. The two-million-block cutoff is replaced by a five-million-block ceiling. Coverage remains partial when a budget is reached. C7 calls do not persist resumable scan sessions. The next-block diagnostic identifies where the scan stopped, while the recovery indexer retains its durable cursor.
- The recovery gateway rejects a returned governance event with a missing or unsuccessful receipt. Recovery validates range membership, sorts and deduplicates events, and advances the cursor only after processing a page. A reported empty page still cannot establish that the provider returned every event.
- Recovery persists finalization winner, tie, total votes and event timestamp via the existing PostgreSQL finalization method. It rejects invalid or missing finalization fields without advancing the page checkpoint. An optional repository method preserves compatibility with repositories that only store status.

**55 C7**, **23 application** and **19 blockchain adapter** tests passed. The API build passed after correcting a TypeScript error. A runner started after the failed build was stopped and excluded because it could have loaded stale JavaScript. Its isolated output and exclusion record are retained separately. Two full replays of the successful run were stable on tested projection keys: [True, True]. Four PostgreSQL reliability fixture observations are recorded, including timeout/resume, duplicate delivery and silent omission.

## Manuscript interpretation

Use these outcomes as a versioned follow-up at the same pin and roster. The experiment measures recovery and same-provider consistency under documented checks. It cannot establish independent blockchain integrity, prove a provider returned every event, or recover application-only data. The earlier 24/15 outcome remains the result of the previous implementation.
