# Recovery checkpoint analysis

| Recorded property | Value |
|---|---|
| Writer and verifier version | v1 |
| Deployment start block | 15463875 |
| Pinned target block | 20325000 |
| Successful gateway ranges | 4862 |
| Gateway range errors | 0 |
| Range sequence contiguous from deployment | True |
| Last gateway range end | 20325000 |
| Persisted checkpoint | 20325000 |
| Persisted checkpoint hash | None |

Recovery writes the cursor after applying each page. The cursor records **scan progress**. It does not certify provider completeness. An RPC error, invalid page, mismatched range, failed receipt or rejected projection prevents that page's cursor advance. The controlled timeout left the prior checkpoint in place, and an incremental retry began at the first failed range. Recovery can have earlier idempotent writes from a failed page because its evidence and projections do not share one all-or-nothing transaction with the cursor.

The controlled omission fixture removed one expected assignment but returned a successful page. The resulting checkpoint was 15465874, with 0 stored assignment rows. The observed coverage label was `scan_progress`. A same-provider state comparison can expose some omissions through count or state discrepancies. A successful empty response or agreement on aggregate state can still conceal omissions, especially events with no net state change.

C7 separately records each proposal's contiguous scan interval and completion reason. A timeout or missing range cannot be counted as verified history. The C7 current-checkpoint field establishes the height check only. The writer does not store an anchor hash, and the experiment separately checked the common block hash at the provider. No independently operated second endpoint was available.
