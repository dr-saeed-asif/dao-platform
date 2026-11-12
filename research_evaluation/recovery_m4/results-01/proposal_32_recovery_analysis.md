# Proposal 32 recovery analysis

| Source | Active assignments |
|---|---:|
| Original SQL snapshot | 10 |
| Original pinned contract read | 9 |
| Recovered SQL | 9 |
| Recovery C7 contract read | 9 |

SQL-only members in the original snapshot relative to the recovered set: 1. Recovered-only members: 0. The original receipt investigation found one extra active row with no linked evidence and a reverted receipt at block 19,347,983 with no logs. If the recovered set is available, exactly 1 original-only rows lack a linked evidence ID.

The recovered membership set agrees with the set reconstructed from the C7-returned membership logs: True. The C7 logs contain 9 assignment or unassignment events for this proposal. Verified C7 transaction references among recovered active assignments: 9/9.

The recovery gateway projects successful assignment events. These observations constrain the source of the assignment disagreement. They do not identify which historical writer persisted the row. The verification and recovery used the same RPC provider.

Sources: original [assignment follow-up](../../experiment_1_m4/run-01/assignment_followup.json), [historical writer investigation](../../failure_diagnosis/ASSIGNMENT_WRITE_PATH.md), and local recovery SQL and C7 records.
