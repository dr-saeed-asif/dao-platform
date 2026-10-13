# Descriptive workspace names and model boundaries

Status: accepted and implemented for structural migration, 13 October 2026.

Use frontend-application, backend-application, llm-implementation and shared-modules with responsibility-specific source directories and filenames.

Preserve package identifiers, exported class names, public routes/model modes, migration IDs, logical Solidity compiler source identity and existing runtime data. Keep framework-required filenames conventional.

Extract shared tool schemas/types into the model workspace so reasoning code has no reverse import into backend. Backend provides trusted retrieval via an injection token and owns concrete tools, SQL, storage, HTTP and research persistence. Separate provider-specific methods without changing payloads, response parsing, caches or retries.

Retain NestJS metadata/configuration compatibility during this migration. Full framework independence, further coordinator/controller extraction and separate workers require their own behavior-preserving refactors.

See [architecture](../architecture.md) and [verification](../architecture-migration-report.md).
