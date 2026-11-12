# Recovery experiment report

The recovery experiment is **complete**. The original SQL snapshot was reused by its saved SHA-256 from Experiment 1. No original rows were loaded into the recovery database. The existing SyncGovernanceUseCase, CyberChainGovernanceGateway and PostgreSQL repositories operated on a fresh PostgreSQL 16 container using the application migration registry. Recovery and verification read the original pin 20325000 on chain 1212 at 0x51b43885899bd0301c2beea89addc9d876145d21. The RPC method allowlist permits reads and the recovery gateway cannot access signing keys. The original population was matched by chain, contract and on-chain proposal ID. The pre-existing M4 SQL snapshot retained original proposal and assignment identifiers and the SQL snapshot identifier.

| Observation | Result |
|---|---:|
| Original proposals | 39 |
| Unique creation events discovered | 39 |
| Reconstructed proposals | 39 |
| Original proposals matched by on-chain ID | 39 |
| Missing original proposals | 0 |
| Extra recovered proposals | 0 |
| Stored assignment rows | 110 |
| Active assignments | 108 |
| Stored votes | 30 |
| Stored governance events | 188 |
| Successful gateway ranges | 4862 |
| Gateway range errors | 0 |
| Live recovery wall seconds | 51.11 |
| C7 attempts | 39 |
| C7 median wall seconds | 7.269 |

| C7 outcome | Count |
|---|---:|
| verified | 24 |
| mismatched | 0 |
| unverified | 15 |
| unavailable | 0 |
| failed | 0 |
| not_attempted | 0 |

| Original C7 outcome | Recovery C7 outcome | Proposals |
|---|---|---:|
| mismatched | verified | 1 |
| unverified | unverified | 15 |
| unverified | verified | 23 |

## What the existing feature reconstructs

Observed recovered metadata URI types: inline JSON: 34, non-inline URI: 5.


The gateway decodes creation, assignment, unassignment, voting, cancellation and finalization events and checks receipts and block evidence. It skips events whose receipts are missing or unsuccessful. Those skips and provider-side event omission can limit reconstruction completeness. The use case saves event evidence, projects operational rows and updates the real cursor after each processed range. It generates synthetic SQL identifiers. Inline base64 JSON metadata can supply titles, descriptions, purposes, option labels and DAO identifiers. External metadata URIs remain references. The feature does not fetch external documents or recreate document indexing, wallet sessions, permissions or original application identifiers. The current finalization projection sets the finalized status and timestamp, while ignoring the winner and tie fields available in the event. SQL projection and ingestion timestamps can differ from the original business timestamps.

## Field comparison

The table counts field outcomes against C7 observations from the same provider. It describes agreement, disagreement and uncertainty for the tested cohort. A second independent provider was not used.

| Field | Verified | Mismatched | Unverified | Unavailable |
|---|---:|---:|---:|---:|
| ends_at | 39 | 0 | 0 | 0 |
| finalized | 39 | 0 | 0 | 0 |
| governance_event | 188 | 0 | 0 | 0 |
| governance_events.count | 27 | 0 | 0 | 0 |
| governance_events.historical_coverage | 0 | 0 | 12 | 0 |
| indexer_checkpoint | 39 | 0 | 0 | 0 |
| metadata_hash | 39 | 0 | 0 | 0 |
| metadata_uri | 39 | 0 | 0 | 0 |
| option_0_vote_count | 39 | 0 | 0 | 0 |
| option_1_vote_count | 39 | 0 | 0 | 0 |
| option_2_vote_count | 32 | 0 | 0 | 0 |
| public.proposal_assignments.count | 39 | 0 | 0 | 0 |
| public.proposals.total_votes | 39 | 0 | 0 | 0 |
| public.votes.count | 39 | 0 | 0 | 0 |
| starts_at | 39 | 0 | 0 | 0 |
| tied | 0 | 0 | 6 | 0 |
| vote | 30 | 0 | 0 | 0 |
| voting_status | 39 | 0 | 0 | 0 |
| winning_option | 0 | 0 | 6 | 0 |

The original comparison uses on-chain proposal IDs and records field equality without disclosing source text. Agreement is not scored as ground-truth accuracy. The CSV uses the initial recovered projection before repeatability replays. C7 ran after the two replays. The later isolated SQL snapshot is archived separately. The replay checks found stable substantive keys and values, with timestamp changes outside their equality criteria. Original options were not included in the frozen SQL export, so original option labels are outside that comparison.

| Original comparison | Equal | Different | Missing recovered | Missing original | Missing both |
|---|---:|---:|---:|---:|---:|
| creator_address | 30 | 9 | 0 | 0 | 0 |
| proposal_type | 39 | 0 | 0 | 0 | 0 |
| metadata_hash | 39 | 0 | 0 | 0 | 0 |
| metadata_uri | 39 | 0 | 0 | 0 | 0 |
| starts_at | 39 | 0 | 0 | 0 | 0 |
| ends_at | 39 | 0 | 0 | 0 | 0 |
| status | 7 | 32 | 0 | 0 | 0 |
| winning_option | 0 | 0 | 0 | 0 | 39 |
| tied | 0 | 0 | 0 | 0 | 39 |
| total_votes | 39 | 0 | 0 | 0 | 0 |
| title | 39 | 0 | 0 | 0 | 0 |
| purpose | 39 | 0 | 0 | 0 | 0 |
| description | 39 | 0 | 0 | 0 | 0 |
| dao_id | 39 | 0 | 0 | 0 | 0 |
| created_at | 30 | 9 | 0 | 0 | 0 |
| updated_at | 0 | 39 | 0 | 0 | 0 |
| cancelled_at | 0 | 1 | 0 | 0 | 38 |
| finalized_at | 0 | 6 | 0 | 0 | 33 |
| active_assignment_set | 38 | 1 | 0 | 0 | 0 |
| voter_option_set | 39 | 0 | 0 | 0 | 0 |

Stored status pairs (original / recovered): CANCELLED / CANCELLED: 1, FINALIZED / FINALIZED: 6, VOTING_CLOSED / ACTIVE: 32. C7 compared temporal voting status at the chain pin independently of raw SQL labels. In 9/9 creator differences, the recovered creator matched both the creation event and transaction sender. The original SQL address differed. The experiment does not establish the original address's application role.

## Checkpoint and reliability

The NestJS writer explicitly selects version v1. The repository's generic default 1 is a separate composite key. The verifier and proposal query now share the writer's explicit version. The new scope assertion failed in 8 checkpoint scenarios before the fix and the full verifier suite passed 50/50 after it. No legacy values were normalized or copied. Recovered checkpoints came from the production use case as it processed ranges. Contiguous observed ranges from deployment: True. Last successful gateway range ended at 20325000. A successful range can still omit events. The checkpoint writer records the height even when a range contains no events. The checkpoint hash remains null in this writer implementation, so the cursor itself provides no stored canonical hash anchor. The experiment checked the target hash before and after recovery and around verification.

The first isolated live attempt stopped with a harness TypeError caused by supplying an operational wrapper to the event repository instead of its Kysely database. It had scanned two ranges and advanced the cursor only through the first. The preserved attempt is under run-01. The corrected harness started from a separate empty database in run-02.

Full replay stability on the recorded projection keys: [True, True]. Replays used the cached live event envelopes and executed the existing recovery use case, with no external RPC calls. Stability excludes mutable timestamps and is not byte-for-byte database equality. Incremental no-op result: {"mode": "INCREMENTAL", "fromBlock": "20325001", "toBlock": "20325000", "batches": 0, "indexed": {"proposals": 0, "assignments": 0, "unassignments": 0, "votes": 0, "cancellations": 0, "finalizations": 0}}. Controlled fixture cases recorded: 4. The injected timeout preserved the last completed checkpoint, an incremental retry restored the missing range, and duplicate delivery kept row counts stable. A silently omitted assignment did **not** stop the cursor advancing. This is an observed recovery limitation. Those fault inputs were controlled fixtures, separate from the live scan.

Proposal 32 is analyzed separately. Neither the recovery result nor a single provider's agreeing data establishes independent chain integrity or identifies the original row writer.

## Commands

- `npm run build --workspace=api`
- `node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts` (50 passed)
- `npm run test --workspace=@dao-platform/application` (18 passed)
- `node research_evaluation/recovery_m4/run.cjs research_evaluation/recovery_m4/run-02`
- `node research_evaluation/recovery_m4/reliability.cjs research_evaluation/recovery_m4/run-02`
- `python research_evaluation/recovery_m4/analyze.py research_evaluation/recovery_m4/run-02`

The loopback-only container was created from pgvector/pgvector:pg16 with a random environment-injected PostgreSQL password. The successful run used database recovery_fresh in that container. Provisioning commands are in the accompanying README. The source commit, dirty state, SQL snapshot identifier, exact pin/hash, range size, provider fingerprint and migration list are in the manifest and raw run configuration. Raw SQL snapshots and full RPC-derived records are Git-ignored.
