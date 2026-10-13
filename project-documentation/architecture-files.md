# DAO Platform - Current Folder and File Inventory

Status: actual implemented source layout, recorded on 13 October 2026.

The trees below list current files, not proposed scaffolding. Generated node_modules,
dist, .next, coverage, local .env files and runtime data are excluded.
See [architecture](architecture.md) for ownership and
[old-to-new source mapping](architecture-migration-map.json) for review.

## File roles

| Suffix | Purpose |
| --- | --- |
| .component.tsx | React UI |
| .provider.tsx | Connected React state/context |
| .controller.ts | Backend request endpoints |
| .request.ts / .requests.ts | Request data/validation contracts |
| .module.ts | Dependency composition |
| .service.ts | Coherent workflow/service |
| .provider.ts | Model provider integration |
| .repository.ts | Database queries/persistence |
| .adapter.ts | Interface integration |
| .interface.ts | Required dependency contract |
| .types.ts / .contracts.ts | Related types and canonical tool schemas |
| .prompt.ts / .prompts.ts | Language model instructions |
| .entity.ts / .value-object.ts | Business entities/values |
| .use-case.ts | Business workflow |
| .migration.ts | Database schema migration |
| .spec.ts / .test.ts / .test.mjs | Behavior verification |

Framework/tool filenames retain their required conventional names. Compatibility
export files are labelled explicitly; existing class/export names remain stable.

## frontend-application

Browser application: governance screens, wallets and backend communication.

```text
frontend-application/
|-- src/
|   |-- app/
|   |   |-- (governance-dashboard)/
|   |   |   `-- page.tsx
|   |   |-- ai-assistant/
|   |   |   `-- results/
|   |   |       `-- [runId]/
|   |   |           `-- (saved-research-answer)/
|   |   |               `-- page.tsx
|   |   |-- analysis/
|   |   |   `-- (research-run-history)/
|   |   |       `-- page.tsx
|   |   |-- api/
|   |   |   `-- cyberchain/
|   |   |       `-- rpc/
|   |   |           `-- route.ts
|   |   |-- application-wide-styles.css
|   |   `-- layout.tsx
|   |-- backend-communication/
|   |   |-- governance-backend-request-client.ts
|   |   `-- governance-backend-response.types.ts
|   |-- blockchain-transaction-inspection/
|   |   `-- decode-blockchain-transaction.component.tsx
|   |-- blockchain-wallet-integration/
|   |   |-- blockchain-wallet.types.ts
|   |   |-- browser-extension-wallet.adapter.ts
|   |   |-- connect-blockchain-wallet.component.tsx
|   |   |-- connected-wallet-state.provider.tsx
|   |   `-- cyberchain-wallet.adapter.ts
|   |-- date-and-time-formatting/
|   |   `-- format-date-and-time.ts
|   |-- governance-question-answering/
|   |   |-- governance-answer-and-evidence.component.tsx
|   |   |-- governance-answer-details-dialog.component.tsx
|   |   `-- governance-question-and-analysis-mode-panel.component.tsx
|   |-- proposal-management/
|   |   |-- create-governance-proposal-form.component.tsx
|   |   |-- governance-dashboard.component.tsx
|   |   `-- governance-proposal-details.component.tsx
|   |-- proposal-member-assignment/
|   |   `-- proposal-member-assignment-manager.component.tsx
|   |-- proposal-voting/
|   |   `-- proposal-voting-panel.component.tsx
|   |-- research-execution-history/
|   |   `-- research-execution-history.component.tsx
|   `-- shared-user-interface/
|       |-- copy-value-button.component.tsx
|       `-- governance-application-shell.component.tsx
|-- .env.example
|-- eslint.config.mjs
|-- next-env.d.ts
|-- next.config.ts
|-- package.json
|-- README.md
`-- tsconfig.json
```

## backend-application

HTTP endpoints, trusted tools, research persistence and background indexing.

```text
backend-application/
|-- src/
|   |-- background-processing/
|   |   |-- blockchain-governance-indexing/
|   |   |   `-- index-blockchain-governance-events.service.ts
|   |   `-- research-document-indexing/
|   |       `-- index-research-documents-and-embeddings.service.ts
|   |-- environment-configuration/
|   |   |-- environment-variables.validation.ts
|   |   `-- language-model-provider-configuration.ts
|   |-- governance-proposal-management/
|   |   |-- assign-proposal-members.request.ts
|   |   |-- configured-governance-owner.authorization.ts
|   |   |-- confirm-proposal-vote.request.ts
|   |   |-- create-governance-proposal.request.spec.ts
|   |   |-- create-governance-proposal.request.ts
|   |   |-- governance-dependency-tokens.ts
|   |   |-- governance-proposal-management.controller.ts
|   |   |-- governance-proposal-management.module.ts
|   |   |-- governance-proposal-query.service.ts
|   |   |-- prepare-proposal-vote.request.ts
|   |   `-- synchronize-proposal-votes.request.ts
|   |-- governance-question-analysis/
|   |   |-- analyze-governance-question.request.ts
|   |   |-- governance-question-analysis.controller.spec.ts
|   |   |-- governance-question-analysis.controller.ts
|   |   |-- governance-question-analysis.module.ts
|   |   |-- language-model-workspace-composition.spec.ts
|   |   |-- proposal-query-tools.controller.ts
|   |   `-- proposal-question-answering-workflow.spec.ts
|   |-- infrastructure-connections/
|   |   |-- database/
|   |   |   |-- database-dependency-tokens.ts
|   |   |   |-- governance-database-shutdown.service.ts
|   |   |   |-- postgresql-connection.module.ts
|   |   |   |-- postgresql-connection.service.spec.ts
|   |   |   |-- postgresql-connection.service.ts
|   |   |   `-- unavailable-governance-event.repository.ts
|   |   `-- document-storage/
|   |       `-- local-research-document-storage.adapter.ts
|   |-- request-error-handling/
|   |   `-- application-error-response.filter.ts
|   |-- research-documents-and-datasets/
|   |   |-- research-document-and-dataset.requests.ts
|   |   |-- research-documents-and-datasets.controller.ts
|   |   |-- research-documents-and-datasets.integration.spec.ts
|   |   |-- research-documents-and-datasets.module.ts
|   |   `-- research-documents-and-datasets.service.ts
|   |-- research-execution-records/
|   |   |-- research-execution-history.controller.spec.ts
|   |   |-- research-execution-history.controller.ts
|   |   `-- save-and-query-research-executions.service.ts
|   |-- service-health-monitoring/
|   |   |-- service-health.controller.spec.ts
|   |   |-- service-health.controller.ts
|   |   `-- service-health.module.ts
|   |-- trusted-governance-data-tools/
|   |   |-- blockchain-evidence-tools/
|   |   |   |-- query-governance-contract-deployment.tool.ts
|   |   |   |-- query-proposal-event-timeline.tool.ts
|   |   |   |-- query-proposal-evidence-and-evidence-origin.tools.ts
|   |   |   `-- query-transactions-indexing-status-and-verify-evidence.tools.ts
|   |   |-- database-query-tools/
|   |   |   |-- list-governance-proposals.tool.spec.ts
|   |   |   |-- list-governance-proposals.tool.ts
|   |   |   |-- list-proposal-members.tool.spec.ts
|   |   |   |-- list-proposal-members.tool.ts
|   |   |   |-- query-governance-proposal-details.tool.ts
|   |   |   |-- query-governance-statistics.tool.ts
|   |   |   |-- query-member-governance-activity.tool.ts
|   |   |   `-- query-proposal-votes.tool.ts
|   |   |-- document-evidence-search/
|   |   |   `-- search-document-evidence.service.ts
|   |   |-- governance-rule-checking-tools/
|   |   |   `-- check-governance-compliance.tools.ts
|   |   `-- legacy-governance-tool-registration.service.ts
|   |-- backend-application.module.ts
|   |-- bootstrap-backend-server.ts
|   `-- configure-backend-request-handling.ts
|-- test/
|   |-- app.e2e-spec.ts
|   |-- jest-e2e.json
|   `-- setup-env.ts
|-- .env.example
|-- eslint.config.mjs
|-- nest-cli.json
|-- package.json
|-- README.md
|-- tsconfig.build.json
`-- tsconfig.json
```

## llm-implementation

Model providers, question routing, prompts, agents and evidence-backed answers.

```text
llm-implementation/
|-- src/
|   |-- agent-task-execution/
|   |   `-- coordinate-governance-analysis-agents.service.ts
|   |-- analysis-data-types/
|   |   |-- governance-agent-execution.types.ts
|   |   |-- governance-compliance-results.types.ts
|   |   `-- proposal-evidence-query-results.types.ts
|   |-- answering-strategies/
|   |   |-- answer-with-language-model-only.service.ts
|   |   `-- answer-with-retrieved-document-evidence.service.ts
|   |-- dependency-interfaces/
|   |   `-- document-evidence-retrieval.interface.ts
|   |-- document-retrieval-and-answering/
|   |   |-- extract-research-document-text.service.ts
|   |   |-- pdf-parser-library.d.ts
|   |   `-- split-document-text-into-searchable-chunks.service.ts
|   |-- evidence-based-answer-generation/
|   |   |-- combine-tool-evidence-and-answer-statements.ts
|   |   `-- generate-answer-from-evidence.service.ts
|   |-- language-model-prompts/
|   |   `-- evidence-based-answer-generation.prompts.ts
|   |-- model-provider-integrations/
|   |   |-- gemini/
|   |   |   |-- generate-chat-response-with-gemini.provider.ts
|   |   |   `-- generate-text-embeddings-with-gemini.provider.ts
|   |   |-- groq/
|   |   |   `-- generate-chat-response-with-groq.provider.ts
|   |   |-- ollama/
|   |   |   |-- generate-chat-response-with-ollama.provider.ts
|   |   |   `-- generate-text-embeddings-with-ollama.provider.ts
|   |   |-- configured-language-model-client.service.ts
|   |   |-- language-model-provider-configuration.ts
|   |   `-- model-provider-transport.interface.ts
|   |-- question-answering-workflows/
|   |   `-- execute-governance-question-workflow.service.ts
|   |-- question-understanding-and-routing/
|   |   |-- plan-recognized-governance-question.ts
|   |   |-- route-governance-question.service.ts
|   |   `-- understand-governance-question.service.ts
|   |-- read-only-tool-contracts/
|   |   |-- check-governance-compliance.contracts.ts
|   |   |-- list-governance-proposals.contracts.ts
|   |   |-- list-proposal-members.contracts.ts
|   |   |-- query-governance-contract-deployment.contracts.ts
|   |   |-- query-governance-proposal-details.contracts.ts
|   |   |-- query-governance-statistics.contracts.ts
|   |   |-- query-member-governance-activity.contracts.ts
|   |   |-- query-proposal-event-timeline.contracts.ts
|   |   |-- query-proposal-evidence-and-evidence-origin.contracts.ts
|   |   |-- query-proposal-votes.contracts.ts
|   |   `-- query-transactions-indexing-status-and-verify-evidence.contracts.ts
|   |-- read-only-tool-execution/
|   |   |-- legacy-agent-tool-registry-exports.ts
|   |   |-- model-context-protocol-tool.adapter.ts
|   |   |-- read-only-tool-contracts.types.ts
|   |   `-- registered-read-only-tools.service.ts
|   |-- request-deadlines-and-call-limits/
|   |   `-- governance-analysis-request-limits.ts
|   `-- index.ts
|-- test/
|   `-- unit-tests/
|       |-- answer-with-language-model-only.spec.ts
|       |-- answer-with-retrieved-document-evidence.spec.ts
|       |-- configured-language-model-client.spec.ts
|       |-- coordinate-governance-analysis-agents.spec.ts
|       |-- extract-research-document-text.spec.ts
|       |-- governance-analysis-request-limits.spec.ts
|       |-- model-context-protocol-tool-adapter.spec.ts
|       |-- plan-recognized-governance-question.spec.ts
|       |-- registered-read-only-tools.spec.ts
|       `-- split-document-text-into-searchable-chunks.spec.ts
|-- package.json
|-- README.md
`-- tsconfig.json
```

## shared-modules/governance-business-rules

Governance entities, values and invariants.

```text
shared-modules/governance-business-rules/
|-- src/
|   |-- business-rule-errors/
|   |   `-- governance-business-rule.error.ts
|   |-- proposal-rules/
|   |   |-- governance-proposal.entity.ts
|   |   `-- governance-proposal.types.ts
|   |-- wallet-address-validation/
|   |   `-- blockchain-wallet-address.value-object.ts
|   `-- index.ts
|-- test/
|   `-- governance-proposal-rules.test.ts
|-- package.json
`-- tsconfig.json
```

## shared-modules/governance-use-cases

Business workflows and required dependency interfaces.

```text
shared-modules/governance-use-cases/
|-- src/
|   |-- blockchain-governance-synchronization/
|   |   |-- clear-indexed-governance-data.use-case.ts
|   |   `-- synchronize-blockchain-governance.use-case.ts
|   |-- dependency-interfaces/
|   |   |-- blockchain-synchronization-state-repository.interface.ts
|   |   |-- blockchain-transaction-repository.interface.ts
|   |   |-- current-time.interface.ts
|   |   |-- database-transaction-manager.interface.ts
|   |   |-- governance-blockchain-gateway.interface.ts
|   |   |-- governance-event-repository.interface.ts
|   |   |-- governance-proposal-authorization.interface.ts
|   |   |-- governance-proposal-repository.interface.ts
|   |   |-- indexed-governance-data-reset.interface.ts
|   |   |-- proposal-member-assignment-repository.interface.ts
|   |   |-- proposal-vote-repository.interface.ts
|   |   `-- unique-identifier-generator.interface.ts
|   |-- proposal-management/
|   |   |-- create-proposal/
|   |   |   |-- create-governance-proposal.command.ts
|   |   |   |-- create-governance-proposal.result.ts
|   |   |   `-- create-governance-proposal.use-case.ts
|   |   |-- get-proposal/
|   |   |   `-- get-governance-proposal.use-case.ts
|   |   |-- list-proposals/
|   |   |   `-- list-governance-proposals.use-case.ts
|   |   |-- list-transactions/
|   |   |   `-- list-proposal-transactions.use-case.ts
|   |   |-- manage-proposal/
|   |   |   |-- cancel-governance-proposal.use-case.ts
|   |   |   `-- finalize-governance-proposal.use-case.ts
|   |   |-- publish-proposal/
|   |   |   `-- publish-governance-proposal.use-case.ts
|   |   `-- governance-proposal.view.ts
|   |-- proposal-member-assignment/
|   |   |-- assign-proposal-members.use-case.ts
|   |   |-- list-proposal-members.use-case.ts
|   |   `-- unassign-proposal-member.use-case.ts
|   |-- proposal-voting/
|   |   |-- confirm-proposal-vote.use-case.ts
|   |   |-- list-proposal-votes.use-case.ts
|   |   |-- prepare-proposal-vote.use-case.ts
|   |   `-- synchronize-proposal-votes.use-case.ts
|   |-- use-case-errors/
|   |   `-- governance-use-case.error.ts
|   `-- index.ts
|-- test/
|   |-- create-governance-proposal.use-case.test.ts
|   |-- publish-governance-proposal.use-case.test.ts
|   `-- synchronize-blockchain-governance.use-case.test.ts
|-- package.json
`-- tsconfig.json
```

## shared-modules/database-persistence

PostgreSQL repositories/schema, vectors and legacy SQLite import.

```text
shared-modules/database-persistence/
|-- scripts/
|   |-- apply-database-schema-migrations.ts
|   |-- check-governance-database-quality.js
|   |-- import-sqlite-data-into-postgresql.ts
|   `-- inspect-governance-database.ts
|-- src/
|   |-- governance-query-data-types/
|   |   |-- blockchain-event-indexing-status.types.ts
|   |   |-- blockchain-node-evidence-verification.types.ts
|   |   |-- governance-contract-deployment.types.ts
|   |   |-- governance-proposal-details.types.ts
|   |   |-- governance-proposal-list.types.ts
|   |   |-- governance-statistics.types.ts
|   |   |-- member-governance-activity.types.ts
|   |   |-- proposal-member-assignment.types.ts
|   |   `-- proposal-voting-results.types.ts
|   |-- legacy-sqlite-compatibility/
|   |   |-- schema-migrations/
|   |   |   |-- governance-records.migration.ts
|   |   |   |-- initial-governance-schema.migration.ts
|   |   |   `-- vote-event-indexing.migration.ts
|   |   |-- sqlite-blockchain-synchronization-state.repository.ts
|   |   |-- sqlite-blockchain-transaction.repository.ts
|   |   |-- sqlite-database-connection.ts
|   |   |-- sqlite-governance-proposal.repository.ts
|   |   |-- sqlite-governance-table.types.ts
|   |   |-- sqlite-proposal-member-assignment.repository.ts
|   |   `-- sqlite-proposal-vote.repository.ts
|   |-- postgresql/
|   |   |-- governance-repositories/
|   |   |   |-- blockchain-synchronization-state.repository.ts
|   |   |   |-- blockchain-transaction.repository.ts
|   |   |   |-- governance-event.repository.ts
|   |   |   |-- governance-proposal.repository.ts
|   |   |   |-- proposal-member-assignment.repository.ts
|   |   |   `-- proposal-vote.repository.ts
|   |   |-- schema-migrations/
|   |   |   |-- document-text-chunks-and-embeddings.migration.ts
|   |   |   |-- governance-contract-deployment-1212.migration.ts
|   |   |   |-- governance-operational-tables.migration.ts
|   |   |   |-- model-agent-execution-metadata.migration.ts
|   |   |   |-- proposal-document-evidence-links.migration.ts
|   |   |   |-- research-documents-and-datasets.migration.ts
|   |   |   `-- research-evidence-provenance.migration.ts
|   |   |-- governance-database-transaction-manager.ts
|   |   |-- normalize-indexed-governance-data.ts
|   |   |-- postgresql-database-connection.ts
|   |   `-- postgresql-table.types.ts
|   |-- proposal-document-manifests/
|   |   `-- governance-proposal-document-manifest.ts
|   |-- sqlite-import-and-reconciliation/
|   |   |-- reconcile-imported-governance-data.ts
|   |   |-- sqlite-import-report.ts
|   |   `-- validate-sqlite-import.ts
|   `-- index.ts
|-- test/
|   |-- import-sqlite-data-into-postgresql.test.ts
|   |-- postgresql-database.test.ts
|   |-- postgresql-governance-event.repository.test.ts
|   |-- postgresql-list-proposals.test.ts
|   |-- postgresql-operational-repositories.test.ts
|   `-- sqlite-governance-proposal.repository.test.ts
|-- package.json
`-- tsconfig.json
```

## shared-modules/cyberchain-blockchain-integration

CyberChain contract/RPC integration and deployment tooling.

```text
shared-modules/cyberchain-blockchain-integration/
|-- scripts/
|   `-- deploy-cyberchain-governance-contract.mjs
|-- src/
|   |-- blockchain-governance-event-envelope.ts
|   |-- cyberchain-governance-contract-interface.ts
|   |-- cyberchain-governance-contract.gateway.ts
|   `-- index.ts
|-- test/
|   `-- cyberchain-governance-contract.gateway.test.ts
|-- package.json
`-- tsconfig.json
```

## shared-modules/governance-smart-contracts

Solidity enforcement, compilation and behavior tests.

```text
shared-modules/governance-smart-contracts/
|-- scripts/
|   `-- compile-governance-smart-contract.mjs
|-- solidity-contracts/
|   `-- CyberDAOGovernance.sol
|-- test/
|   `-- CyberDAOGovernance.test.mjs
`-- package.json
```

## shared-modules/frontend-backend-data-contracts

Browser-safe public request/response types.

```text
shared-modules/frontend-backend-data-contracts/
|-- src/
|   |-- blockchain-transaction-response.types.ts
|   |-- governance-proposal-request-and-response.types.ts
|   |-- governance-question-analysis-request-and-response.types.ts
|   |-- index.ts
|   |-- proposal-member-assignment.types.ts
|   |-- proposal-voting-request-and-response.types.ts
|   |-- research-document-response.types.ts
|   `-- research-execution-history-response.types.ts
|-- package.json
|-- README.md
`-- tsconfig.json
```

## deployment-configuration

Local database service configuration.

```text
deployment-configuration/
`-- docker/
    `-- docker-compose.yml
```

## smart-contract-deployment-records

Existing verified deployment records.

```text
smart-contract-deployment-records/
`-- cyber-dao-governance-1212.json
```

## repository-maintenance-scripts

Repository maintenance commands.

```text
repository-maintenance-scripts/
|-- inspect-governance-database.js
`-- migrate-cyberchain-signing-environment.mjs
```

## Project documentation

Architecture, decisions, existing request collection, security reviews and screenshots.

```text
project-documentation/
|-- application-screenshots/
|   |-- governance-dashboard.png
|   `-- proposals.png
|-- architecture-decisions/
|   |-- 0001-governance-contract-v1.md
|   `-- 0002-descriptive-workspace-names-and-model-boundaries.md
|-- architecture-files.md
|-- architecture-migration-map.json
|-- architecture-migration-report.md
|-- architecture.md
|-- backend-request-testing/
|   |-- DAO-Platform.postman_collection.json
|   `-- README.md
|-- query-governance-proposals-tool-workflow.md
`-- security-reviews/
    `-- dependency-risk-register.md
```

## Repository root

package.json: workspace commands; package-lock.json: single lockfile; readme.md: onboarding; .env.example: configuration template; .gitignore: secrets/generated-data exclusions.

The existing data/ directory and local environment files retain their runtime locations.
