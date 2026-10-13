# Governance backend application

NestJS/Fastify endpoints, proposal use-case composition, trusted data tools, research persistence and background indexing.

Run from repository root:

```powershell
npm.cmd run dev:backend
```

The application loads ../.env and local .env relative to this workspace. PORT controls the server port; POSTGRES_URL is required. Artefact storage defaults to ../data/artefacts, preserving the original repository data location.

The server entry is src/bootstrap-backend-server.ts. nest-cli.json specifies that entry; start:prod runs dist/bootstrap-backend-server.

Model providers, prompts, routing and answer workflows are imported from @dao-platform/language-models. Database/RPC tool implementations and document indexing stay in backend. DOCUMENT_EVIDENCE_SEARCH binds the extracted document-answer workflow to the existing retrieval service.

Public request types are shared with frontend; server-side request handling and existing API routes remain compatible.

```powershell
npm.cmd run build --workspace=api
npm.cmd run typecheck --workspace=api
npm.cmd test --workspace=api -- --runInBand
```

See [migration verification](../project-documentation/architecture-migration-report.md) for pre-existing test failures and test-environment limitations.
