# DAO Platform

Production-ready DAO backend integrating with CyberChain.

## Applications

- `apps/api`: REST API
- `apps/worker`: Blockchain synchronization and background jobs

## Packages

- `domain`: Enterprise business rules and domain models
- `application`: Use cases and application interfaces
- `blockchain-cyberchain`: CyberChain SDK integration
- `database`: Database schema and repository implementations
- `contracts`: Smart contract ABIs and generated wrappers
- `config`: Environment configuration
- `observability`: Logging, metrics, and tracing

## CyberChain deployment

Governance contract version 1 is deployed on network `1212` at:

```text
0x51b43885899bd0301c2beea89addc9d876145d21
```

See `docs/adr/0001-governance-contract-v1.md` and the `deployments` directory
for its scope and verified deployment metadata.
