# Experiment 1 reconciliation comparison

The corrected C7 run is **complete** with **39/39** original proposals attempted.

| Outcome | Archived verifier | C7 follow-up |
|---|---:|---:|
| verified | 23 | 0 |
| mismatched | 7 | 1 |
| unverified | 9 | 38 |
| unavailable | 0 | 0 |
| failed | 0 | 0 |
| not_attempted | 0 | 0 |

| Archived outcome | C7 outcome | Proposals |
|---|---|---:|
| mismatched | mismatched | 1 |
| mismatched | unverified | 6 |
| unverified | unverified | 9 |
| verified | unverified | 23 |

The archived status-discrepancy subset contains 6 proposals. Their voting-status field verified in 6/6 cases, including 6 Closed/Closed comparisons. Overall outcomes also depend on other fields and checkpoint evidence.

The verifier reported a missing scoped checkpoint for 39/39 attempts.
The frozen SQL snapshot contains governance-full version `v1` at block 20267608, 57,392 blocks below the common pin. The C7 service queries version `1`. This version discrepancy explains missing scoped coverage when reported. The stored height is evidence of the legacy checkpoint's position. The run did not establish compatibility or canonical anchoring for that row.

## Evidence gaps and execution

- winning_option was unverified in 6 field comparisons.
- tied was unverified in 6 field comparisons.
- governance_events.historical_coverage was unverified in 39 field comparisons.
- Recorded service errors: {}. Unavailable outcomes: 0. Thrown execution failures: 0.
- Wall time median 7.320 s, range 3.212–11.316 s across 39 sequential attempts.

## Detected disagreements

- Proposal on-chain ID 32 had comparison mismatches {"public.proposal_assignments.count": 1} and 0 mismatched receipts.
  - `public.proposal_assignments.count` compared SQL `10` with chain `9`.

Proposal 32 had 10 distinct active SQL members and 9 contract assignments. The returned events reconstructed 9 members from 9 assignments and 0 unassignments. One SQL-only row had no linked event evidence. Its referenced receipt returned status `0x0` at block 19347983 with 0 logs. The provider's block hash agreed with the receipt. The archived decoded call links it to the assignment operation. The evidence supports a persistent SQL-side inconsistency relative to the observed chain. It leaves the exact historical writer unresolved.

## Interpretation limits

C7 used one chain pin (20325000) and contemporary repeatable-read SQL. The archived run used 27 distinct pins and an earlier SQL observation. Outcome transitions are descriptive. A single RPC provider supplied chain state, events and receipt confirmation. The experiment cannot establish independent chain integrity or a general accuracy rate. Missing coverage, missing outcome fields and RPC errors remain separately recorded in the CSV and JSON summary.

Sources: `reconciliation_39_summary.json`, `reconciliation_39_results.csv`, `run-01/assignment_followup.json`, `../springer/reconciliation.jsonl`, `../springer_history/failed_assignment_receipt.json`, and `../failure_diagnosis/ASSIGNMENT_WRITE_PATH.md`.
