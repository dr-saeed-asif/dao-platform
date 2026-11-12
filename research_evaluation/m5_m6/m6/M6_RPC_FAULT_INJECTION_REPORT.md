# M6 RPC and indexer evaluation

The actual compiled C7 service ran 16 controlled RPC/SQL cases. Fifteen matched the predeclared classification, with one coherently stale-provider fixture accepted as verified. The verifier has no trusted external head reference or configured maximum staleness. This is a capability limitation under this fixture. It does not demonstrate a stale live node.

The detected-or-withheld matrix was TP 12, FN 1, FP 0, TN 3 across 13 injected uncertainty/unsafe cases and three expected-valid controls. False-negative rate was 1/13 and false-positive rate 0/3. Abstention/unavailable outcomes were 10/16. Unavailable outputs were 4/16. One timeout and one connection-failure injection were tested. These frequencies reflect the designed case mix. They are not observed operational failure rates.

A separate real-PostgreSQL recovery fixture confirmed preservation of the last completed cursor, retry at the first failed range and stable counts under duplicate delivery. It is the seventeenth Table B row and is excluded from the 16-case service matrix because it uses a different multi-step oracle.

## Table B

| Fault type | Expected classification | Observed classification | Correct classification rate | Failure reason |
|---|---|---|---:|---|
| control | verified | verified | 1/1 | See raw reasons |
| stale RPC node | unverified | verified | 0/1 | Freshness was not independently established |
| lagging RPC node | unverified | unverified | 1/1 | See raw reasons |
| wrong chain ID | mismatched | mismatched | 1/1 | See raw reasons |
| inconsistent block hash | unverified | unverified | 1/1 | See raw reasons |
| missing event log | mismatched | mismatched | 1/1 | See raw reasons |
| duplicate event log | verified | verified | 1/1 | See raw reasons |
| out-of-order event logs | verified | verified | 1/1 | See raw reasons |
| partial log range | unavailable | unavailable | 1/1 | See raw reasons |
| RPC timeout | unavailable | unavailable | 1/1 | See raw reasons |
| RPC connection failure | unavailable | unavailable | 1/1 | See raw reasons |
| malformed RPC response | unavailable | unavailable | 1/1 | See raw reasons |
| reorganization during verification | unverified | unverified | 1/1 | See raw reasons |
| indexer checkpoint behind pin | unverified | unverified | 1/1 | See raw reasons |
| missing checkpoint | unverified | unverified | 1/1 | See raw reasons |
| same event absent in SQL and RPC | unverified | unverified | 1/1 | See raw reasons |
| interrupted recovery and resume | checkpoint_preserved_then_resumed | checkpoint_preserved_then_resumed | 1/1 | See raw reasons |

## Endpoint independence and assumptions

Only one configured RPC provider was available. No genuinely independently operated endpoint was identified from the available configuration. No live independent provider comparison was performed and no Table C or independent-agreement CSV was generated. The prior live recovery evidence is referenced by its preserved hashes and was not re-executed here.

The verifier checks configured chain/contract, pins contract reads to the returned block, validates initial block height, checks the pin hash again, validates log ranges and transaction receipts, and compares scoped checkpoint progress. The most recent live campaign used block 20,325,000 with no confirmation-depth offset. That policy does not establish finality. The reconstructed SQL and RPC can agree on the same provider's incomplete view. An empty response is not proof of event absence.

The missing-log case with a known SQL event was mismatched. The joint-omission case was unverified because proposal creation coverage was not established. A more complex omission with no net state change can remain indistinguishable without independently available history. The four recovery observations include successful retry and duplicate cases, plus the limitation that a silently omitted assignment did not stop scan-progress advancement.

## Reproducibility and exclusions

Fixtures reused the original test fixture definitions and the current compiled service. The stale fixture deliberately supplied a coherent older head without an external reference. No chain transactions or live RPC faults were introduced. One initial out-of-order fixture was inconsistent with its stored vote count. Its raw attempt is retained and excluded, and only that case was rerun using a coherent assignment event. The corrected record is in raw-corrected.jsonl. The recovery launcher had an initial path-resolution failure before a database experiment and was corrected before execution.

These findings support bounded fault handling within the tested cases. They leave endpoint independence, provider completeness, finality and operational reliability unmeasured. The matrix does not establish cryptographic blockchain integrity.

The coherent-stale scenario reused the clean fixture response sequence and labelled that provider view stale in the experiment oracle. No freshness signal was encoded in the verifier input. Its acceptance demonstrates indistinguishability from a healthy view under these inputs. The scenario-based false-negative count must not be interpreted as measured stale-node detection in a real network.
