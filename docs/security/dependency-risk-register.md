# Dependency risk register

## CyberChain SDK WebSocket dependency

- Status: Open upstream risk
- Affected dependency: `ws`, transitively installed by
  `@cyberchain/smart-contract-wrapper@2.1.0`
- Mitigation: DAO runtime adapters use configured HTTP RPC URLs and do not
  instantiate the SDK WebSocket provider.
- Required follow-up: upgrade the SDK when it publishes a release using a
  patched `ws` version, then rerun integration and indexing tests.

## Ganache contract-test dependencies

- Status: Development-only
- Scope: `ganache` is used only by `packages/contracts` behavioral tests and is
  not part of the API or worker production image.
- Risk: its legacy transitive toolchain produces npm audit findings.
- Required follow-up: migrate local EVM behavior tests to a current maintained
  runner and keep the production container build scoped to runtime workspaces.

## Governance contract audit

- Status: Independent audit required
- Scope: the deployed v1 contract records assignments and votes but does not
  custody funds or execute arbitrary calls.
- Required follow-up: complete an external Solidity review before treating vote
  outcomes as production governance authority. Any treasury executor requires a
  separate threat model, tests, audit, timelock, and multisignature controls.
