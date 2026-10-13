# DAO Platform - Descriptive Folder and File Plan

Status: revised proposal only. This replaces the previous abbreviated layout.
No source code, folder, configuration or data has been changed.

Names identify responsibility, action and file role. Paths below are future names.
[M] = existing implementation moved/renamed; [X] = split/extracted existing code;
[N] = new contract/configuration. All M/X entries need import/tooling updates.
Generated output, node_modules and secrets are excluded.

## 1. Frontend application

Current source: apps/web. Features are grouped directly by user task, with no generic lib folder.

```text
frontend-application/
|-- package.json                                                    [M]
|-- tsconfig.json                                                   [M]
|-- next.config.ts                                                  [M]
|-- next-env.d.ts                                                    [M]
|-- eslint.config.mjs                                               [M]
|-- .env.example                                                    [M]
|-- README.md                                                       [M]
`-- src/
    |-- app/
    |   |-- layout.tsx                                              [M] framework root layout
    |   |-- application-wide-styles.css                             [M] globals.css
    |   |-- (governance-dashboard)/page.tsx                          [M] preserve /
    |   |-- analysis/(research-run-history)/page.tsx                 [M] preserve /analysis
    |   |-- ai-assistant/results/[runId]/(saved-research-answer)/page.tsx [M] preserve result URL
    |   `-- api/cyberchain/rpc/route.ts                              [M] preserve existing public proxy path
    |-- shared-user-interface/
    |   |-- governance-application-shell.component.tsx              [M] app-shell.tsx
    |   `-- copy-value-button.component.tsx                         [M]
    |-- proposal-management/
    |   |-- governance-dashboard.component.tsx                      [M]
    |   |-- create-governance-proposal-form.component.tsx            [M]
    |   `-- governance-proposal-details.component.tsx               [M]
    |-- proposal-voting/
    |   `-- proposal-voting-panel.component.tsx                     [M]
    |-- proposal-member-assignment/
    |   `-- proposal-member-assignment-manager.component.tsx        [M]
    |-- blockchain-wallet-integration/
    |   |-- connected-wallet-state.provider.tsx                     [M] wallet-provider.tsx
    |   |-- connect-blockchain-wallet.component.tsx                  [M]
    |   |-- blockchain-wallet.types.ts                              [M] wallet/types.ts
    |   |-- browser-extension-wallet.adapter.ts                     [M] injected-wallet.ts
    |   `-- cyberchain-wallet.adapter.ts                             [M]
    |-- blockchain-transaction-inspection/
    |   `-- decode-blockchain-transaction.component.tsx              [M]
    |-- governance-question-answering/
    |   |-- governance-question-and-analysis-mode-panel.component.tsx [M] ai-panel.tsx
    |   |-- governance-answer-and-evidence.component.tsx             [M] analysis-result.tsx
    |   `-- governance-answer-details-dialog.component.tsx           [M] analysis-result-modal.tsx
    |-- research-execution-history/
    |   `-- research-execution-history.component.tsx                 [M] research-runs.tsx
    |-- backend-communication/
    |   |-- governance-backend-request-client.ts                     [M] lib/api/client.ts
    |   `-- backend-response-type-exports.ts                         [X] UI-only types/shared re-exports
    `-- date-and-time-formatting/
        `-- format-date-and-time.ts                                 [M]
```

Next.js page.tsx/layout.tsx/route.ts are conventional filenames. Parent route groups
make their purpose visible without changing URLs. These groups are not implemented.
Existing public paths containing api/rpc are retained for compatibility; custom
implementation names use full words. Frontend does not import model providers/secrets.

## 2. Backend application

Current source: apps/api. Group services by business responsibility, not generic modules/common folders.

```text
backend-application/
|-- package.json                                                    [M]
|-- tsconfig.json                                                   [M]
|-- tsconfig.build.json                                             [M]
|-- nest-cli.json                                                   [M]
|-- eslint.config.mjs                                               [M]
|-- README.md                                                       [M]
|-- .env.example                                                    [N] backend configuration template
|-- src/
|   |-- bootstrap-backend-server.ts                                 [M] main.ts
|   |-- configure-backend-request-handling.ts                        [M] configure-app.ts
|   |-- backend-application.module.ts                               [M] app.module.ts
|   |-- environment-configuration/
|   |   |-- environment-variables.validation.ts                     [M] env.validation.ts
|   |   `-- language-model-provider-configuration.ts                 [X] ai-provider.config.ts
|   |-- request-error-handling/
|   |   `-- application-error-response.filter.ts                     [M]
|   |-- service-health-monitoring/
|   |   |-- service-health.module.ts                                [M]
|   |   |-- service-health.controller.ts                            [M]
|   |   `-- service-health.controller.spec.ts                        [M]
|   |-- governance-proposal-management/
|   |   |-- governance-proposal-management.module.ts                 [M]
|   |   |-- governance-proposal-management.controller.ts             [M]
|   |   |-- governance-proposal-query.service.ts                     [M]
|   |   |-- governance-dependency-tokens.ts                           [M] proposals.tokens.ts
|   |   |-- configured-governance-owner.authorization.ts              [M]
|   |   |-- create-governance-proposal.request.ts                     [M]
|   |   |-- create-governance-proposal.request.spec.ts                [M]
|   |   |-- assign-proposal-members.request.ts                       [M]
|   |   |-- prepare-proposal-vote.request.ts                         [M]
|   |   |-- confirm-proposal-vote.request.ts                         [M]
|   |   `-- synchronize-proposal-votes.request.ts                    [M]
|   |-- research-documents-and-datasets/
|   |   |-- research-documents-and-datasets.module.ts                 [M]
|   |   |-- research-documents-and-datasets.controller.ts             [M]
|   |   |-- research-documents-and-datasets.service.ts                [M]
|   |   |-- research-document-and-dataset.requests.ts                 [M] research.dto.ts
|   |   `-- research-documents-and-datasets.integration.spec.ts       [M]
|   |-- research-execution-records/
|   |   |-- research-execution-history.controller.ts                  [M]
|   |   |-- research-execution-history.controller.spec.ts             [M]
|   |   `-- save-and-query-research-executions.service.ts              [M]
|   |-- governance-question-analysis/
|   |   |-- governance-question-analysis.module.ts                    [M] ai.module.ts
|   |   |-- governance-question-analysis.controller.ts                [M] ai.controller.ts
|   |   |-- governance-question-analysis.controller.spec.ts           [M]
|   |   |-- analyze-governance-question.request.ts                    [M] ai.dto.ts
|   |   |-- analyze-governance-question.service.ts                    [X] controller workflow
|   |   `-- proposal-query-tools.controller.ts                        [M]
|   |-- infrastructure-connections/
|   |   |-- database/
|   |   |   |-- postgresql-connection.module.ts                       [M]
|   |   |   |-- postgresql-connection.service.ts                      [M]
|   |   |   |-- postgresql-connection.service.spec.ts                 [M]
|   |   |   |-- database-dependency-tokens.ts                         [M]
|   |   |   |-- governance-database-shutdown.service.ts                [M] review usage before moving
|   |   |   `-- unavailable-governance-event.repository.ts            [M] review fallback usage
|   |   |-- blockchain/
|   |   |   `-- cyberchain-governance-connection.module.ts             [X] gateway wiring
|   |   `-- document-storage/
|   |       `-- local-research-document-storage.adapter.ts            [M] local-artefact.storage.ts
|   |-- trusted-governance-data-tools/
|   |   |-- legacy-governance-tool-registration.service.ts            [M] compatibility registration
|   |   |-- database-query-tools/
|   |   |   |-- list-governance-proposals.tool.ts                      [M]
|   |   |   |-- list-governance-proposals.tool.spec.ts                 [M]
|   |   |   |-- list-proposal-members.tool.ts                          [M]
|   |   |   |-- list-proposal-members.tool.spec.ts                     [M]
|   |   |   |-- query-governance-proposal-details.tool.ts              [M]
|   |   |   |-- query-proposal-votes.tool.ts                           [M]
|   |   |   |-- query-member-governance-activity.tool.ts               [M]
|   |   |   `-- query-governance-statistics.tool.ts                    [M]
|   |   |-- blockchain-evidence-tools/
|   |   |   |-- query-transactions-indexing-status-and-verify-evidence.tools.ts [M] existing combined tools
|   |   |   |-- query-governance-contract-deployment.tool.ts           [M]
|   |   |   |-- query-proposal-event-timeline.tool.ts                  [M]
|   |   |   `-- query-proposal-evidence-and-evidence-origin.tools.ts   [M]
|   |   |-- governance-rule-checking-tools/
|   |   |   `-- check-governance-compliance.tools.ts                   [M]
|   |   `-- document-evidence-search/
|   |       `-- document-evidence-search.adapter.ts                   [X] retrieval interface binding
|   `-- background-processing/
|       |-- blockchain-governance-indexing/
|       |   `-- index-blockchain-governance-events.service.ts          [M]
|       `-- research-document-indexing/
|           `-- index-research-documents-and-embeddings.service.ts     [M] scheduling/storage/database writes
`-- test/
    |-- test-environment-setup.ts                                    [M]
    |-- jest-end-to-end-tests.json                                   [M]
    |-- end-to-end-tests/governance-backend.end-to-end.spec.ts         [M]
    `-- integration-tests/proposal-question-answering-workflow.spec.ts [M]
```

request.ts files retain runtime DTO validation internally; changing the filename
does not replace validation. The research module currently composes documents,
datasets and run services; retain that DI ownership initially even with clearer folders.
Naming bootstrap-backend-server.ts requires Nest entryFile/build/start settings updates.

Trusted tools call database/blockchain services; models do not generate raw SQL or
receive signing keys. Preserve validated scope and existing read-only restrictions.

## 3. Large language model implementation

Current source: apps/api/src/ai. Split server-dependent code before extraction.

```text
large-language-model-implementation/
|-- package.json                                                    [N]
|-- tsconfig.json                                                   [N]
|-- README.md                                                       [N]
|-- src/
|   |-- index.ts                                                    [N] public library exports
|   |-- analysis-data-types/
|   |   |-- governance-agent-execution.types.ts                      [M] agent.types.ts
|   |   |-- governance-question-input.types.ts                       [X]
|   |   |-- governance-answer-and-evidence.types.ts                   [X]
|   |   `-- language-model-provider-configuration.types.ts           [X]
|   |-- dependency-interfaces/
|   |   |-- chat-model-provider.interface.ts                         [N]
|   |   |-- text-embedding-provider.interface.ts                     [N]
|   |   |-- document-evidence-retrieval.interface.ts                 [N]
|   |   `-- read-only-governance-tool.interface.ts                    [N]
|   |-- model-provider-integrations/
|   |   |-- language-model-provider-factory.ts                       [X] explicit provider construction
|   |   |-- language-model-provider.error.ts                         [X]
|   |   |-- model-provider-request-retries.ts                        [X]
|   |   |-- ollama/
|   |   |   |-- generate-chat-response-with-ollama.provider.ts        [X]
|   |   |   `-- generate-text-embeddings-with-ollama.provider.ts      [X]
|   |   |-- gemini/
|   |   |   |-- generate-chat-response-with-gemini.provider.ts        [X]
|   |   |   `-- generate-text-embeddings-with-gemini.provider.ts      [X]
|   |   `-- groq/
|   |       `-- generate-chat-response-with-groq.provider.ts          [X]
|   |-- answering-strategies/
|   |   |-- answer-with-language-model-only.service.ts                [M] llm-only.system.ts
|   |   |-- answer-with-retrieved-document-evidence.service.ts        [M] vector-rag.system.ts
|   |   `-- select-governance-answering-strategy.ts                    [X] current mode dispatch
|   |-- agent-task-execution/
|   |   `-- coordinate-governance-analysis-agents.service.ts          [M] multi-agent.system.ts
|   |-- question-understanding-and-routing/
|   |   |-- understand-governance-question.service.ts                 [M]
|   |   |-- route-governance-question.service.ts                      [M]
|   |   `-- plan-recognized-governance-question.ts                     [M] direct-plan.ts
|   |-- question-answering-workflows/
|   |   `-- execute-governance-question-workflow.service.ts           [M]
|   |-- document-retrieval-and-answering/
|   |   |-- extract-research-document-text.service.ts                 [M]
|   |   |-- split-document-text-into-searchable-chunks.service.ts      [M]
|   |   |-- search-document-evidence.service.ts                       [X] retrieval flow via interface
|   |   `-- pdf-parser-library.d.ts                                  [M] external parser declarations
|   |-- evidence-based-answer-generation/
|   |   |-- combine-tool-evidence-and-answer-statements.ts            [M] evidence-fusion.ts
|   |   `-- generate-answer-from-evidence.service.ts                  [M] synthesis.service.ts
|   |-- answer-claim-verification/
|   |   `-- verify-answer-claims-against-evidence.service.ts           [X] existing checks/correction flow
|   |-- language-model-prompts/
|   |   |-- evidence-based-answer-generation.prompts.ts               [M] synthesis.prompt.ts
|   |   |-- model-only-answer-instructions.prompt.ts                  [X]
|   |   |-- document-evidence-answer-instructions.prompt.ts            [X]
|   |   |-- governance-question-routing-instructions.prompt.ts        [X]
|   |   `-- answer-claim-verification-instructions.prompt.ts          [X]
|   |-- read-only-tool-execution/
|   |   |-- registered-read-only-tools.service.ts                     [M] canonical tool-registry.ts
|   |   |-- read-only-tool-contracts.types.ts                         [M]
|   |   |-- model-context-protocol-tool.adapter.ts                    [M] mcp.adapter.ts
|   |   `-- legacy-agent-tool-registry-exports.ts                     [M] temporary compatibility re-export
|   `-- request-deadlines-and-call-limits/
|       `-- governance-analysis-request-limits.ts                    [M] request-budget.ts
`-- test/unit-tests/
    |-- answer-with-language-model-only.spec.ts                       [M]
    |-- answer-with-retrieved-document-evidence.spec.ts               [M]
    |-- coordinate-governance-analysis-agents.spec.ts                 [M]
    |-- plan-recognized-governance-question.spec.ts                    [M]
    |-- extract-research-document-text.spec.ts                        [M]
    |-- split-document-text-into-searchable-chunks.spec.ts             [M]
    |-- governance-analysis-request-limits.spec.ts                    [M]
    |-- registered-read-only-tools.spec.ts                            [M]
    |-- model-context-protocol-tool-adapter.spec.ts                    [M]
    `-- model-provider-integrations/
        |-- generate-chat-and-embeddings-with-ollama.spec.ts          [X] split current client coverage
        |-- generate-chat-and-embeddings-with-gemini.spec.ts          [X]
        `-- generate-chat-response-with-groq.spec.ts                  [X] extend coverage only where needed
```

The current OllamaClient contains Ollama/Gemini/Groq chat plus Ollama/Gemini embedding
implementations. Groq does not get an invented embedding file: current embeddings
come from Ollama. Provider-specific files are extracted code, not implemented files.

The multi-agent service currently implements hybrid modes as well. Preserve external
strings llm-only, vector-rag, multi-agent, hybrid and hybrid-verified. Filenames can
be descriptive without changing those public values.

Current direct-plan.ts and evidence-fusion.ts import concrete tool schemas/types.
Extract shared tool contracts into this library or inject registered schemas; do
not leave imports back into backend tools after moving these files. Remove NestJS
and ConfigService from reusable code; pass validated settings/dependencies explicitly.
Research recording stays in backend; there is no duplicate model-library recorder.

## 4. Shared modules: governance business rules

Current source: packages/domain.

```text
shared-modules/governance-business-rules/
|-- package.json                                                    [M]
|-- tsconfig.json                                                   [M]
|-- src/
|   |-- index.ts                                                    [M]
|   |-- proposal-rules/
|   |   |-- governance-proposal.entity.ts                            [M] proposal.ts
|   |   `-- governance-proposal.types.ts                             [M]
|   |-- wallet-address-validation/
|   |   `-- blockchain-wallet-address.value-object.ts                [M]
|   `-- business-rule-errors/
|       `-- governance-business-rule.error.ts                        [M]
`-- test/governance-proposal-rules.test.ts                            [M]
```

Entities/invariants stay independent of HTTP, storage, chain SDK and model providers.

## 5. Shared modules: governance use cases

Current source: packages/application. Existing workflows retain their behavior.

```text
shared-modules/governance-use-cases/
|-- package.json                                                    [M]
|-- tsconfig.json                                                   [M]
|-- src/
|   |-- index.ts                                                    [M]
|   |-- dependency-interfaces/
|   |   |-- current-time.interface.ts                                [M] clock.ts
|   |   |-- unique-identifier-generator.interface.ts                 [M] id-generator.ts
|   |   |-- governance-proposal-repository.interface.ts              [M]
|   |   |-- governance-proposal-authorization.interface.ts           [M]
|   |   |-- proposal-member-assignment-repository.interface.ts       [M]
|   |   |-- proposal-vote-repository.interface.ts                     [M]
|   |   |-- blockchain-transaction-repository.interface.ts           [M]
|   |   |-- governance-event-repository.interface.ts                 [M]
|   |   |-- governance-blockchain-gateway.interface.ts               [M]
|   |   |-- blockchain-synchronization-state-repository.interface.ts [M]
|   |   |-- indexed-governance-data-reset.interface.ts                [M]
|   |   `-- database-transaction-manager.interface.ts                [M]
|   |-- proposal-management/
|   |   |-- create-proposal/
|   |   |   |-- create-governance-proposal.use-case.ts                [M]
|   |   |   |-- create-governance-proposal.command.ts                 [M]
|   |   |   `-- create-governance-proposal.result.ts                  [M]
|   |   |-- publish-proposal/publish-governance-proposal.use-case.ts  [M]
|   |   |-- get-proposal/get-governance-proposal.use-case.ts          [M]
|   |   |-- list-proposals/list-governance-proposals.use-case.ts      [M]
|   |   |-- manage-proposal/cancel-governance-proposal.use-case.ts    [M]
|   |   |-- manage-proposal/finalize-governance-proposal.use-case.ts  [M]
|   |   |-- list-transactions/list-proposal-transactions.use-case.ts  [M]
|   |   `-- governance-proposal.view.ts                              [M]
|   |-- proposal-member-assignment/
|   |   |-- assign-proposal-members.use-case.ts                      [M]
|   |   |-- unassign-proposal-member.use-case.ts                      [M]
|   |   `-- list-proposal-members.use-case.ts                         [M]
|   |-- proposal-voting/
|   |   |-- prepare-proposal-vote.use-case.ts                         [M]
|   |   |-- confirm-proposal-vote.use-case.ts                         [M]
|   |   |-- list-proposal-votes.use-case.ts                           [M]
|   |   `-- synchronize-proposal-votes.use-case.ts                    [M]
|   |-- blockchain-governance-synchronization/
|   |   |-- synchronize-blockchain-governance.use-case.ts             [M]
|   |   `-- clear-indexed-governance-data.use-case.ts                 [M]
|   `-- use-case-errors/
|       `-- governance-use-case.error.ts                             [M]
`-- test/
    |-- create-governance-proposal.use-case.test.ts                   [M]
    |-- publish-governance-proposal.use-case.test.ts                  [M]
    `-- synchronize-blockchain-governance.use-case.test.ts            [M]
```

Dependency interfaces describe what workflows require. Database/chain adapters
implement them. Existing suite files should move with their use cases.

## 6. Shared modules: database persistence

Current source: packages/database. Group PostgreSQL, query payloads, document manifests
and SQLite import/compatibility separately. Preserve database migration identities/order.

```text
shared-modules/database-persistence/
|-- package.json                                                    [M]
|-- tsconfig.json                                                   [M]
|-- src/
|   |-- index.ts                                                    [M]
|   |-- postgresql/
|   |   |-- postgresql-database-connection.ts                        [M] postgres-database.ts
|   |   |-- postgresql-table.types.ts                               [M] postgres-database-schema.ts
|   |   |-- governance-database-transaction-manager.ts               [M] postgres-operational-database.ts
|   |   |-- normalize-indexed-governance-data.ts                     [M]
|   |   |-- governance-repositories/
|   |   |   |-- governance-proposal.repository.ts                    [M]
|   |   |   |-- proposal-member-assignment.repository.ts             [M]
|   |   |   |-- proposal-vote.repository.ts                          [M]
|   |   |   |-- blockchain-transaction.repository.ts                 [M]
|   |   |   |-- blockchain-synchronization-state.repository.ts       [M]
|   |   |   `-- governance-event.repository.ts                       [M]
|   |   |-- document-retrieval-repositories/
|   |   |   `-- search-research-document-vectors.repository.ts        [X] SQL from vector-search.service.ts
|   |   `-- schema-migrations/
|   |       |-- governance-operational-tables.migration.ts           [M] operational-dao
|   |       |-- research-documents-and-datasets.migration.ts         [M] artefact-dataset-core
|   |       |-- proposal-document-evidence-links.migration.ts        [M] proposal-artefact-links
|   |       |-- research-evidence-provenance.migration.ts            [M] research-provenance
|   |       |-- document-text-chunks-and-embeddings.migration.ts      [M] document-chunks
|   |       |-- model-agent-execution-metadata.migration.ts          [M] agent-run-metadata
|   |       `-- governance-contract-deployment-1212.migration.ts      [M]
|   |-- governance-query-data-types/
|   |   |-- governance-proposal-list.types.ts                        [M]
|   |   |-- governance-proposal-details.types.ts                     [M]
|   |   |-- governance-statistics.types.ts                           [M] dao-statistics.types.ts
|   |   |-- proposal-member-assignment.types.ts                      [M]
|   |   |-- proposal-voting-results.types.ts                         [M]
|   |   |-- member-governance-activity.types.ts                       [M]
|   |   |-- governance-contract-deployment.types.ts                  [M]
|   |   |-- blockchain-event-indexing-status.types.ts                [M]
|   |   `-- blockchain-node-evidence-verification.types.ts           [M] verify-against-rpc.types.ts
|   |-- proposal-document-manifests/
|   |   `-- governance-proposal-document-manifest.ts                 [M]
|   |-- sqlite-import-and-reconciliation/
|   |   |-- validate-sqlite-import.ts                                [M] validators.ts
|   |   |-- sqlite-import-report.ts                                 [M] report.ts
|   |   `-- reconcile-imported-governance-data.ts                    [M] reconciler.ts
|   `-- legacy-sqlite-compatibility/
|       |-- sqlite-database-connection.ts                           [M]
|       |-- sqlite-governance-table.types.ts                        [M] database-schema.ts
|       |-- sqlite-governance-proposal.repository.ts                 [M]
|       |-- sqlite-proposal-member-assignment.repository.ts         [M]
|       |-- sqlite-proposal-vote.repository.ts                       [M]
|       |-- sqlite-blockchain-transaction.repository.ts              [M]
|       |-- sqlite-blockchain-synchronization-state.repository.ts   [M]
|       `-- schema-migrations/
|           |-- initial-governance-schema.migration.ts              [M]
|           |-- governance-records.migration.ts                     [M]
|           `-- vote-event-indexing.migration.ts                    [M]
|-- scripts/
|   |-- apply-database-schema-migrations.ts                         [M] migrate.ts
|   |-- inspect-governance-database.ts                              [M] inspect.ts
|   |-- import-sqlite-data-into-postgresql.ts                        [M] import-sqlite.ts
|   `-- check-governance-database-quality.js                         [M] check_quality.js
`-- test/
    |-- sqlite-governance-proposal.repository.test.ts                [M]
    |-- postgresql-database-connection.test.ts                      [M]
    |-- postgresql-governance-event.repository.test.ts              [M]
    |-- postgresql-operational-repositories.test.ts                 [M]
    |-- postgresql-list-governance-proposals.test.ts                 [M]
    `-- import-sqlite-data-into-postgresql.test.ts                   [M]
```

SQL migrations must retain recorded identifiers/checksums and execution order when
filenames move/rename. Inspect migration loader behavior before implementation;
file appearance must not accidentally cause schema changes to rerun.

Equal vector dimensions do not make distinct embedding models compatible. Retain
vector(1024) constraints and model identity handling until re-indexing is planned.

## 7. Shared modules: CyberChain integration and smart contracts

Current sources: packages/blockchain-cyberchain and packages/contracts.

```text
shared-modules/
|-- cyberchain-blockchain-integration/
|   |-- package.json                                                [M]
|   |-- tsconfig.json                                               [M]
|   |-- src/
|   |   |-- index.ts                                                [M]
|   |   |-- cyberchain-governance-contract.gateway.ts                [M]
|   |   |-- cyberchain-governance-contract-interface.ts              [M] cyberchain-governance.abi.ts
|   |   `-- blockchain-governance-event-envelope.ts                 [M]
|   |-- scripts/deploy-cyberchain-governance-contract.mjs            [M]
|   `-- test/cyberchain-governance-contract.gateway.test.ts          [M]
`-- governance-smart-contracts/
    |-- package.json                                                [M]
    |-- solidity-contracts/CyberDAOGovernance.sol                     [M]
    |-- scripts/compile-governance-smart-contract.mjs                [M]
    `-- test/CyberDAOGovernance.test.mjs                             [M]
```

Preserve Solidity contract/class names, ABI exports and deployment records during
filesystem naming changes. Generated artifacts are build output, not source files.

## 8. Shared modules: frontend/backend data contracts

Extract browser-safe public payload types from frontend types and backend responses.
These contracts do not contain model credentials, database entities or server decorators.

```text
shared-modules/frontend-backend-data-contracts/
|-- package.json                                                    [N]
|-- tsconfig.json                                                   [N]
|-- README.md                                                       [N]
`-- src/
    |-- index.ts                                                    [N]
    |-- governance-proposal-request-and-response.types.ts            [X]
    |-- proposal-voting-request-and-response.types.ts                [X]
    |-- proposal-member-assignment.types.ts                          [X]
    |-- blockchain-transaction-response.types.ts                     [X]
    |-- research-document-response.types.ts                         [X]
    |-- governance-question-analysis-request-and-response.types.ts   [X]
    |-- research-execution-history-response.types.ts                 [X]
    `-- backend-error-response.types.ts                              [X]
```

Sharing TypeScript types does not validate incoming runtime requests. Keep backend
validation, or unify runtime schemas through a separately agreed validation strategy.

## 9. Deployment, documentation and maintenance

```text
deployment-configuration/
`-- docker/docker-compose.yml                                      [M] current root Compose

smart-contract-deployment-records/
`-- cyber-dao-governance-1212.json                                   [M] retain existing evidence filename

project-documentation/
|-- architecture.md                                                [M] this architecture overview
|-- architecture-files.md                                          [M] this file plan
|-- query-governance-proposals-tool-workflow.md                      [M] list-proposals-tool.md
|-- architecture-decisions/
|   |-- 0001-governance-contract-v1.md                              [M]
|   `-- 0002-descriptive-workspace-names-and-model-boundaries.md     [N]
|-- backend-request-testing/
|   |-- README.md                                                   [M]
|   `-- DAO-Platform.postman_collection.json                        [M] preserve collection format/name
|-- security-reviews/
|   `-- dependency-risk-register.md                                [M]
`-- application-screenshots/
    |-- governance-dashboard.png                                   [M]
    `-- proposals.png                                              [M]

repository-maintenance-scripts/
|-- migrate-cyberchain-signing-environment.mjs                       [M] migrate-sdk-env.mjs
`-- inspect-governance-database.js                                  [M] root inspect_db.js; review usage

repository root/
|-- package.json                                                   [M] workspace commands
|-- package-lock.json                                              [M] single lockfile
|-- .gitignore                                                     [M] ignore secrets/generated data
|-- .env.example                                                   [M] compatibility configuration template
`-- readme.md                                                      [M] project onboarding
```

Current docs still live under docs/; project-documentation is a future destination.
Do not create duplicate source/document copies when migrating. Local .env/.env.local
and local-runtime-data contain local configuration/runtime data and stay ignored.
Moving Compose/data changes invocation/relative paths and needs separate validation.

## 10. Meaning of file suffixes

| Suffix | Meaning |
| --- | --- |
| .component.tsx | React user interface |
| .provider.tsx | React context/state provider |
| .controller.ts | Backend request endpoints |
| .request.ts / .requests.ts | Incoming request validation/data classes |
| .module.ts | Dependency composition |
| .service.ts | A coherent workflow/service |
| .repository.ts | Database queries/persistence |
| .adapter.ts | Integration behind an interface |
| .interface.ts | Dependency contract |
| .types.ts | Related data shapes |
| .prompt.ts / .prompts.ts | Language model instructions |
| .use-case.ts | Business workflow |
| .migration.ts | Database schema migration |
| .spec.ts / .test.ts | Behavior verification |

## 11. Migration boundaries

- Introduce interfaces before extracting reusable model services.
- Preserve existing HTTP routes and llm-only/vector-rag/multi-agent/hybrid/hybrid-verified values.
- Keep public package identities/exported APIs stable during initial path changes.
- Update workspace declarations, imports/exports, TypeScript/Jest settings, Nest entryFile, build order, scripts, lockfile and relative env/storage paths together.
- Keep database/RPC tools in backend, actual SQL in database-persistence and reusable reasoning/model code in the model library.
- Keep one canonical tool registry; legacy exports exist only during import migration.
- Group existing controllers as they are initially; separate membership/voting controllers only if endpoint size/dependencies justify it.
- Move existing tests with their implementations; do not invent implementation-mirroring tests for cosmetic renames.
- Extra workers/queues require workload or deployment needs, not appearance.

See [architecture overview](architecture.md) for responsibilities and the runtime diagram.
The current-source inventories below are evidence of existing names, not another proposed structure.

## 12. Current-source inventories (unchanged)


### apps/web

```text
apps/web\.env.example
apps/web\eslint.config.mjs
apps/web\next.config.ts
apps/web\next-env.d.ts
apps/web\package.json
apps/web\README.md
apps/web\src\app\ai-assistant\results\[runId]\page.tsx
apps/web\src\app\analysis\page.tsx
apps/web\src\app\api\cyberchain\rpc\route.ts
apps/web\src\app\globals.css
apps/web\src\app\layout.tsx
apps/web\src\app\page.tsx
apps/web\src\components\app-shell.tsx
apps/web\src\components\copy-value-button.tsx
apps/web\src\features\ai\ai-panel.tsx
apps/web\src\features\ai\analysis-result.tsx
apps/web\src\features\ai\analysis-result-modal.tsx
apps/web\src\features\ai\research-runs.tsx
apps/web\src\features\decoder\transaction-decoder.tsx
apps/web\src\features\members\member-manager.tsx
apps/web\src\features\proposals\create-proposal-form.tsx
apps/web\src\features\proposals\governance-dashboard.tsx
apps/web\src\features\proposals\proposal-details.tsx
apps/web\src\features\voting\voting-panel.tsx
apps/web\src\features\wallet\connect-wallet.tsx
apps/web\src\features\wallet\wallet-provider.tsx
apps/web\src\lib\api\client.ts
apps/web\src\lib\api\types.ts
apps/web\src\lib\date-time.ts
apps/web\src\lib\wallet\cyberchain-wallet.ts
apps/web\src\lib\wallet\injected-wallet.ts
apps/web\src\lib\wallet\types.ts
apps/web\tsconfig.json
```


### apps/api

```text
apps/api\eslint.config.mjs
apps/api\nest-cli.json
apps/api\package.json
apps/api\README.md
apps/api\src\ai\__tests__\ai.controller.spec.ts
apps/api\src\ai\__tests__\chunking.service.spec.ts
apps/api\src\ai\__tests__\direct-plan.spec.ts
apps/api\src\ai\__tests__\llm-only.system.spec.ts
apps/api\src\ai\__tests__\mcp.adapter.spec.ts
apps/api\src\ai\__tests__\multi-agent.system.spec.ts
apps/api\src\ai\__tests__\ollama.client.spec.ts
apps/api\src\ai\__tests__\proposal-list-workflow.spec.ts
apps/api\src\ai\__tests__\request-budget.spec.ts
apps/api\src\ai\__tests__\text-extraction.service.spec.ts
apps/api\src\ai\__tests__\tool-registry.spec.ts
apps/api\src\ai\__tests__\vector-rag.system.spec.ts
apps/api\src\ai\agents\agent.types.ts
apps/api\src\ai\agents\governance-tools.service.ts
apps/api\src\ai\agents\mcp.adapter.ts
apps/api\src\ai\agents\multi-agent.system.ts
apps/api\src\ai\agents\tool-registry.ts
apps/api\src\ai\ai.controller.ts
apps/api\src\ai\ai.dto.ts
apps/api\src\ai\ai.module.ts
apps/api\src\ai\ai-provider.config.ts
apps/api\src\ai\chunking.service.ts
apps/api\src\ai\embedding-pipeline.service.ts
apps/api\src\ai\llm-only.system.ts
apps/api\src\ai\ollama.client.ts
apps/api\src\ai\orchestration\evidence-fusion.ts
apps/api\src\ai\orchestration\query-orchestrator.ts
apps/api\src\ai\pdf-parse.d.ts
apps/api\src\ai\request-budget.ts
apps/api\src\ai\router\direct-plan.ts
apps/api\src\ai\router\query-router.ts
apps/api\src\ai\router\query-understanding.service.ts
apps/api\src\ai\synthesis\synthesis.prompt.ts
apps/api\src\ai\synthesis\synthesis.service.ts
apps/api\src\ai\text-extraction.service.ts
apps/api\src\ai\tools\compliance\compliance.tools.ts
apps/api\src\ai\tools\offchain\member.tools.spec.ts
apps/api\src\ai\tools\offchain\member.tools.ts
apps/api\src\ai\tools\offchain\member-activity.tools.ts
apps/api\src\ai\tools\offchain\proposal.tools.spec.ts
apps/api\src\ai\tools\offchain\proposal.tools.ts
apps/api\src\ai\tools\offchain\proposal-details.tools.ts
apps/api\src\ai\tools\offchain\proposal-votes.tools.ts
apps/api\src\ai\tools\offchain\statistics.tools.ts
apps/api\src\ai\tools\onchain\deployment.tools.ts
apps/api\src\ai\tools\onchain\provenance.tools.ts
apps/api\src\ai\tools\onchain\timeline.tools.ts
apps/api\src\ai\tools\onchain\transaction.tools.ts
apps/api\src\ai\tools\proposal-tools.controller.ts
apps/api\src\ai\tools\tool.types.ts
apps/api\src\ai\tools\tool-registry.ts
apps/api\src\ai\vector-rag.system.ts
apps/api\src\ai\vector-search.service.ts
apps/api\src\app.module.ts
apps/api\src\common\application-exception.filter.ts
apps/api\src\config\env.validation.ts
apps/api\src\configure-app.ts
apps/api\src\database\database.tokens.ts
apps/api\src\database\postgres.module.ts
apps/api\src\database\postgres.service.spec.ts
apps/api\src\database\postgres.service.ts
apps/api\src\database\unavailable-governance-event.repository.ts
apps/api\src\health\health.controller.spec.ts
apps/api\src\health\health.controller.ts
apps/api\src\health\health.module.ts
apps/api\src\main.ts
apps/api\src\proposals\assign-members.dto.ts
apps/api\src\proposals\configured-owner.authorization.ts
apps/api\src\proposals\confirm-vote.dto.ts
apps/api\src\proposals\create-proposal.dto.spec.ts
apps/api\src\proposals\create-proposal.dto.ts
apps/api\src\proposals\database-lifecycle.service.ts
apps/api\src\proposals\prepare-vote.dto.ts
apps/api\src\proposals\proposal-query.service.ts
apps/api\src\proposals\proposals.controller.ts
apps/api\src\proposals\proposals.module.ts
apps/api\src\proposals\proposals.tokens.ts
apps/api\src\proposals\sync-votes.dto.ts
apps/api\src\proposals\voting-indexer.service.ts
apps/api\src\research\local-artefact.storage.ts
apps/api\src\research\research.controller.ts
apps/api\src\research\research.dto.ts
apps/api\src\research\research.integration.spec.ts
apps/api\src\research\research.module.ts
apps/api\src\research\research.service.ts
apps/api\src\research\research-runs.controller.spec.ts
apps/api\src\research\research-runs.controller.ts
apps/api\src\research\research-runs.service.ts
apps/api\test\app.e2e-spec.ts
apps/api\test\jest-e2e.json
apps/api\test\setup-env.ts
apps/api\tsconfig.build.json
apps/api\tsconfig.json
```


### packages/domain

```text
packages/domain\package.json
packages/domain\src\index.ts
packages/domain\src\proposal\proposal.ts
packages/domain\src\proposal\proposal.types.ts
packages/domain\src\shared\domain-rule.error.ts
packages/domain\src\shared\wallet-address.ts
packages/domain\test\proposal.test.ts
packages/domain\tsconfig.json
```


### packages/application

```text
packages/application\package.json
packages/application\src\index.ts
packages/application\src\membership\assign-members.use-case.ts
packages/application\src\membership\list-members.use-case.ts
packages/application\src\membership\unassign-member.use-case.ts
packages/application\src\ports\assignment-repository.ts
packages/application\src\ports\chain-transaction-repository.ts
packages/application\src\ports\clock.ts
packages/application\src\ports\governance-chain.gateway.ts
packages/application\src\ports\governance-event-repository.ts
packages/application\src\ports\governance-read-model-reset.ts
packages/application\src\ports\id-generator.ts
packages/application\src\ports\proposal-authorization.ts
packages/application\src\ports\proposal-repository.ts
packages/application\src\ports\sync-state-repository.ts
packages/application\src\ports\transaction-manager.ts
packages/application\src\ports\vote-repository.ts
packages/application\src\proposal\create-proposal\create-proposal.command.ts
packages/application\src\proposal\create-proposal\create-proposal.result.ts
packages/application\src\proposal\create-proposal\create-proposal.use-case.ts
packages/application\src\proposal\get-proposal\get-proposal.use-case.ts
packages/application\src\proposal\list-proposals\list-proposals.use-case.ts
packages/application\src\proposal\list-transactions\list-transactions.use-case.ts
packages/application\src\proposal\manage-proposal\cancel-proposal.use-case.ts
packages/application\src\proposal\manage-proposal\finalize-proposal.use-case.ts
packages/application\src\proposal\proposal.view.ts
packages/application\src\proposal\publish-proposal\publish-proposal.use-case.ts
packages/application\src\shared\application.error.ts
packages/application\src\synchronization\clear-governance-data.use-case.ts
packages/application\src\synchronization\sync-governance.use-case.ts
packages/application\src\voting\confirm-vote.use-case.ts
packages/application\src\voting\list-votes.use-case.ts
packages/application\src\voting\prepare-vote.use-case.ts
packages/application\src\voting\sync-votes.use-case.ts
packages/application\test\create-proposal.use-case.test.ts
packages/application\test\publish-proposal.use-case.test.ts
packages/application\test\sync-governance.use-case.test.ts
packages/application\tsconfig.json
```


### packages/database

```text
packages/database\check_quality.js
packages/database\package.json
packages/database\scripts\import-sqlite.ts
packages/database\scripts\inspect.ts
packages/database\scripts\migrate.ts
packages/database\src\contract-deployment.types.ts
packages/database\src\dao-statistics.types.ts
packages/database\src\database-schema.ts
packages/database\src\index.ts
packages/database\src\indexer-status.types.ts
packages/database\src\member-activity.types.ts
packages/database\src\migration\reconciler.ts
packages/database\src\migration\report.ts
packages/database\src\migration\validators.ts
packages/database\src\migrations\governance-records.migration.ts
packages/database\src\migrations\initial.migration.ts
packages/database\src\migrations\voting-indexer.migration.ts
packages/database\src\postgres-assignment.repository.ts
packages/database\src\postgres-chain-transaction.repository.ts
packages/database\src\postgres-database.ts
packages/database\src\postgres-database-schema.ts
packages/database\src\postgres-governance-event.repository.ts
packages/database\src\postgres-migrations\agent-run-metadata.migration.ts
packages/database\src\postgres-migrations\artefact-dataset-core.migration.ts
packages/database\src\postgres-migrations\contract-deployment-1212.migration.ts
packages/database\src\postgres-migrations\document-chunks.migration.ts
packages/database\src\postgres-migrations\operational-dao.migration.ts
packages/database\src\postgres-migrations\proposal-artefact-links.migration.ts
packages/database\src\postgres-migrations\research-provenance.migration.ts
packages/database\src\postgres-operational-database.ts
packages/database\src\postgres-operational-normalization.ts
packages/database\src\postgres-proposal.repository.ts
packages/database\src\postgres-sync-state.repository.ts
packages/database\src\postgres-vote.repository.ts
packages/database\src\proposal-details.types.ts
packages/database\src\proposal-list.types.ts
packages/database\src\proposal-manifest.ts
packages/database\src\proposal-members.types.ts
packages/database\src\proposal-votes.types.ts
packages/database\src\sqlite-assignment.repository.ts
packages/database\src\sqlite-chain-transaction.repository.ts
packages/database\src\sqlite-database.ts
packages/database\src\sqlite-proposal.repository.ts
packages/database\src\sqlite-sync-state.repository.ts
packages/database\src\sqlite-vote.repository.ts
packages/database\src\verify-against-rpc.types.ts
packages/database\test\import-sqlite.test.ts
packages/database\test\postgres-database.test.ts
packages/database\test\postgres-governance-event.repository.test.ts
packages/database\test\postgres-list-proposals.test.ts
packages/database\test\postgres-operational-repositories.test.ts
packages/database\test\sqlite-proposal.repository.test.ts
packages/database\tsconfig.json
```


### packages/blockchain-cyberchain

```text
packages/blockchain-cyberchain\package.json
packages/blockchain-cyberchain\scripts\deploy-governance.mjs
packages/blockchain-cyberchain\src\cyberchain-governance.abi.ts
packages/blockchain-cyberchain\src\cyberchain-governance.gateway.ts
packages/blockchain-cyberchain\src\governance-event-envelope.ts
packages/blockchain-cyberchain\src\index.ts
packages/blockchain-cyberchain\test\cyberchain-governance.gateway.test.ts
packages/blockchain-cyberchain\tsconfig.json
```


### packages/contracts

```text
packages/contracts\contracts\CyberDAOGovernance.sol
packages/contracts\package.json
packages/contracts\scripts\compile.mjs
packages/contracts\test\CyberDAOGovernance.test.mjs
```


### scripts

```text
scripts\migrate-sdk-env.mjs
```


### deployments

```text
deployments\cyber-dao-governance-1212.json
```

