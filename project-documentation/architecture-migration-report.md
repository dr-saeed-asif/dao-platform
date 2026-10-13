# Architecture migration verification

Completed structural migration: 13 October 2026.

## Implemented

- Moved frontend/backend to descriptive root workspaces and renamed source files by responsibility.
- Moved domain, application, persistence, CyberChain and Solidity workspaces under shared-modules with descriptive names.
- Extracted the model workspace and canonical tool contracts; backend owns concrete tools/retrieval/storage/indexing.
- Separated five existing provider-specific chat/embedding methods into provider files; kept request payloads, response parsing, caches, retries and provider selection.
- Moved 15 existing public transport types into seven browser-safe contract files. Frontend and backend now import the shared request contract.
- Updated npm links/lockfile, build paths, TypeScript references, server entry, relative environment/storage paths, documentation and deployment tooling.
- Moved Compose with explicit project name dao-platform to preserve named-volume identity. Existing runtime data and local credentials remain in place.
- Added one dependency-composition test for the extracted model library and backend retrieval binding.

## Build and type verification

| Check | Result |
| --- | --- |
| Root production build | Passed: shared modules, model library, backend and frontend |
| Frontend production routes | Existing /, /analysis, /ai-assistant/results/[runId], /api/cyberchain/rpc preserved |
| Root workspace type-check | Passed, including the newly added backend type-check command |
| Relative source import resolution | No unresolved relative imports |
| Original-to-current source mapping | All mapped destinations exist |
| Model source importing backend | None |
| Renamed SQLite import CLI --help | Passed without connecting to a database |

The initial frontend baseline build could not fetch Google Fonts. The final real
production builds fetched fonts successfully; no font mocks or UI/font substitutions
were introduced.

## Tests compared with baseline

| Area | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Model workspace | 64 | 0 | 0 |
| Backend after migration | 55 | 14 | 3 |
| Governance business rules | 5 | 0 | 0 |
| Governance use cases | 12 | 0 | 0 |
| Database persistence | 4 | 0 | 8 |
| CyberChain integration | 9 | 0 | 0 |
| Solidity contract | 4 | 0 | 0 |
| Total | 153 | 14 | 11 |

Before migration, the combined backend/model tests had 118 passes, 14 failures and
3 skips. After separation, they have 119 passes, the same 14 failures and 3 skips.
The additional passing test verifies dependency composition. The five original
shared workspace suites also retain their baseline results. No new test failure was
observed in these runs; the full test command is not all-green.

The existing failures are eight controller tests whose test module omits ConfigService,
and six proposal-list workflow assertions about routing errors/call counts. Their
runtime implementations and expectations were not changed to mask those failures.

Database integration tests were skipped because a PostgreSQL test connection was not
provided in process environment. No application database migrations, live-chain
transactions, deployment or production data changes were executed. Compose YAML parsed successfully with the installed js-yaml parser. Service/volume
configuration is unchanged apart from the explicit project identity. Docker CLI
runtime validation was unavailable.

## Method-body comparison

Compared 445 existing class method bodies against the original tracked source.
Provider wrappers were checked against their extracted function bodies after replacing
the context qualifier with the original this qualifier. All matched except the local
storage constructor's necessary relative-default change from ../../data/artefacts to
../data/artefacts, which preserves the repository data location after the backend move.
This checks source equivalence in those paths; it is not exhaustive runtime verification.

Database migration identifiers/order and logical Solidity compiler source identity
remain unchanged. Compatibility class/package names and existing API/model mode values
are retained.

## Deliberate compatibility choices

Existing NestJS metadata/configuration dependencies remain in model implementation.
Complete framework independence and further splitting of coordinator/controller logic
are separate refactors. The current structural migration does not add empty layers,
new auth behavior, another model server, workers, queues or model modes. data/ remains
at its existing path.

## Existing failed tests

- `/src/governance-question-analysis/proposal-question-answering-workflow.spec.ts`: Proposal-list workflow rejects invalid or contradictory plans before tool execution
- `/src/governance-question-analysis/proposal-question-answering-workflow.spec.ts`: Proposal-list workflow rejects invalid or contradictory plans before tool execution
- `/src/governance-question-analysis/proposal-question-answering-workflow.spec.ts`: Proposal-list workflow rejects invalid or contradictory plans before tool execution
- `/src/governance-question-analysis/proposal-question-answering-workflow.spec.ts`: Proposal-list workflow rejects invalid or contradictory plans before tool execution
- `/src/governance-question-analysis/proposal-question-answering-workflow.spec.ts`: Proposal-list workflow asks for a supported request when the LLM cannot express its filters
- `/src/governance-question-analysis/proposal-question-answering-workflow.spec.ts`: Proposal-list workflow counts failed LLM attempts and does not expose their error payload
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController health should return healthy status
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController health should return degraded when ollama unhealthy
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController query should handle llm-only query
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController query should handle vector-rag query
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController query should handle errors gracefully
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController query runs and stores hybrid using the shared hybrid engine
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController query runs and stores hybrid-verified using the shared hybrid engine
- `/src/governance-question-analysis/governance-question-analysis.controller.spec.ts`: AiController query runs and stores the multi-agent system separately

See [architecture](architecture.md), [current file inventory](architecture-files.md)
and [path mapping](architecture-migration-map.json).
