# ADR 0001: Governance contract version 1

## Status

Accepted and deployed to CyberChain network `1212` on 2026-07-14.

## Decision

`CyberDAOGovernance` version 1 is an on-chain proposal assignment and voting
registry. It enforces proposal-specific eligibility and one vote per wallet.
Proposal documents are stored off-chain and anchored with a URI and `bytes32`
content hash.

The contract supports:

- two-step administrator ownership;
- owner-created proposals with 2 to 10 voting options;
- member assignment before voting begins;
- assigned-member-only voting;
- duplicate-vote prevention;
- cancellation and permissionless result finalization;
- events for complete off-chain indexing.

This version deliberately does not execute arbitrary calls or custody treasury
assets. Treasury execution requires a separately audited design with quorum,
approval thresholds, timelocks, and a multisignature or governance executor.

## Compatibility

The source is compiled with Solidity 0.8.36 for the London EVM target because
the current CyberChain SDK constructs London-compatible transactions.

## Deployment

- Network ID: `1212`
- Contract: `0x51b43885899bd0301c2beea89addc9d876145d21`
- Transaction: `0xf161771c1b4d356ef03b2e18d7ad9202134a45283c66b1a4a7216759cf629ee8`
- Initial owner: `0xb8163f7d6d404f67a400743b90f7952d2d137b8e`

The complete receipt metadata and bytecode digest are stored in
`deployments/cyber-dao-governance-1212.json`.

## Consequences

The backend and indexer can treat contract events as the authority for proposal
creation, assignments, votes, cancellation, and finalization. Contract changes
require a new deployment because this version is intentionally non-upgradeable.
