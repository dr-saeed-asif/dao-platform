# Testing listProposals

This milestone adds the read-only `listProposals` tool, its shared registry foundation, and an Ollama-powered question workflow. You can test through the CyberGovAI UI, the existing AI query endpoint, or the direct tool endpoint.

## Structure

```text
apps/api/src/ai/
  tools/
    tool.types.ts
    tool-registry.ts
    proposal-tools.controller.ts
    offchain/
      proposal.tools.ts
      proposal.tools.spec.ts
  router/query-router.ts
  orchestration/query-orchestrator.ts
  orchestration/evidence-fusion.ts
  synthesis/synthesis.service.ts
  synthesis/synthesis.prompt.ts
  ai.module.ts
```

The old `agents/tool-registry.ts` re-exports the same registry. Existing tools retain their registrations. The tool calls `ProposalQueryService`, which delegates to `PostgresProposalRepository.listFiltered`; SQL remains in the database package.

## Run

Build the database package and API, then restart the API using the existing environment configuration:

```powershell
npm.cmd run build --workspace=@dao-platform/database
npm.cmd run build --workspace=api
npm.cmd run start:dev --workspace=api
```

`POST /v1/ai/tools/list-proposals` accepts a JSON object. It does not invoke an LLM, embeddings, MCP, or blockchain RPC. It works with `MCP_ENABLED=false`.

```powershell
$body = @{
  status = 'ACTIVE'
  from = $null
  to = $null
  limit = 20
  offset = 0
} | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:3000/v1/ai/tools/list-proposals' `
  -ContentType 'application/json' -Body $body
```

Use your configured API port if it differs from 3000. `{}` selects all proposal statuses with the default pagination.

## Ask through the LLM

In the CyberGovAI Assistant, select **All proposals**, choose Hybrid, Hybrid + Verifier, or Multi-Agent Hybrid + Verifier, and ask:

- “How many proposals are active now?”
- “Which proposals are upcoming?”
- “Show finalized proposals.”
- “List active proposals, limit 5, offset 5.”
- “List proposals whose voting starts from 2026-10-01T00:00:00Z to 2026-10-31T23:59:59Z.”

Or call the existing endpoint:

```powershell
$body = @{
  system = 'multi-agent'
  question = 'How many proposals are active now?'
} | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:3000/v1/ai/query' `
  -ContentType 'application/json' -Body $body
```

The successful flow uses two real `OllamaClient.chat` calls:

```text
Question
→ LLM router proposes listProposals filters
→ Schema validation and registry allowlist
→ Existing proposal service and PostgreSQL
→ Evidence fusion
→ LLM selects the evidence-backed answer statements
→ Statement/citation validation and rendering
→ Cited answer
```

The synthesis LLM selects statements from a catalog built from the actual query result. The application renders those facts verbatim, keeping exact totals, returned row details, pagination, and citations intact. It rejects invented statement IDs, omitted statements, and free-form additions. The model never calculates a count or generates SQL. This is constrained synthesis rather than unrestricted prose generation.

Set `IS_ACTIVE=true` for the configured Gemini models or `IS_ACTIVE=false` for the configured Ollama models. Set `MAX_LLM_CALLS` to at least 2 and `MAX_AGENT_STEPS` to at least 1. Failed calls count toward the budget. Responses expose `llmCalls`, `toolsUsed`, evidence, and traces so you can verify that the tool and LLM ran. Verified modes additionally return claim verification; plain Hybrid omits that report while still validating model output.

Unsupported filters, multiple statuses, document summaries, or ambiguous date ranges require a more specific supported question. Live listings cannot answer dataset-pinned historical queries. Single-proposal questions continue through their existing routes. If a proposal is selected while asking a listing question, its DAO becomes the trusted DAO scope; select All proposals to query the configured deployment.

MCP is optional and is not used by this internal-tool workflow. `MCP_ENABLED=false` works normally. No external MCP server has been configured or contacted by this change. `llm-only` and `vector-rag` retain their existing behavior and do not use this tool.

## Semantics

- `status`: `ACTIVE`, `UPCOMING`, `ENDED`, `CANCELLED`, `FINALIZED`, or `null` (all).
- `from` / `to`: inclusive bounds on `starts_at`, supplied as ISO timestamps with an explicit timezone, or `null`. They do not filter creation time. `from` must not exceed `to`.
- `limit`: integer from 1 to 100, default 20. `offset`: nonnegative safe integer, default 0. Strings and unknown fields are rejected.
- Active: no cancellation or finalization timestamp, `starts_at <= asOf <= ends_at`. Stored status is not used. This follows the requested date rule even for a row whose stored status is DRAFT or PENDING; publication is not an additional filter.
- Upcoming: no terminal timestamp and `starts_at > asOf`.
- ENDED filter: `ends_at < asOf` or either terminal timestamp exists. Returned rows preserve their derived `ENDED`, `CANCELLED`, or `FINALIZED` status.
- Cancellation takes precedence over finalization if both timestamps exist.
- `count` is computed by PostgreSQL before pagination, including when the requested page is empty. Rows sort by creation time descending, then local ID ascending.
- `memberCount` counts currently assigned members. `voteCount` counts rows in the existing effective-vote projection, separately from voting power. Independent count subqueries avoid multiplying counts through joins.
- A repeatable-read, read-only transaction keeps totals and rows consistent. Query work has a database statement timeout; registry execution has a 10-second timeout. Request cancellation signals stop waiting and reach the tool, while already-running SQL is bounded by the statement timeout.
- Queries are restricted to the configured chain and governance contract. The endpoint follows the existing public proposal-read access model. Trusted in-process callers may additionally supply `ToolContext.daoId`; the JSON body cannot override scope. This does not introduce user authentication or per-user DAO authorization.

## Evidence and observability

The response contains `count`, `proposals`, `evidenceIds`, and `query`. Query metadata records the filters, observation time, and deployment scope. Proposal references use `structured:proposal:<local-id>` and resolve through the existing `getEvidenceById` tool. These are mutable operational database references, not immutable blockchain proofs. Dataset-pinned verification rejects them.

Evidence IDs cover returned rows, not every row contributing to a paginated total. Query metadata describes the total's basis; this milestone does not persist historical aggregate snapshots. An empty page returns an empty evidence array.

The LLM workflow adds `structured:listProposals:<runId>` to identify the actual aggregate query result attached to that response. Its evidence record contains the count, filters, scope and observation time, including for a zero count. It is a run-local query-result reference, not a stored event or a reference resolved by `getEvidenceById`. The existing research-run recording path saves it with the answer; it is not a full historical snapshot of all contributing database rows.

Registry execution metadata contains only tool name, status, latency, and evidence IDs. It does not record arguments or results. Validation errors return HTTP 400, tool timeouts 504, and other failures a generic 500 response.

## Checks

```powershell
npm.cmd run test --workspace=api -- --runInBand --runTestsByPath src/ai/tools/offchain/proposal.tools.spec.ts src/ai/__tests__/tool-registry.spec.ts src/ai/__tests__/multi-agent.system.spec.ts src/ai/__tests__/mcp.adapter.spec.ts src/ai/__tests__/ai.controller.spec.ts
npm.cmd run test --workspace=api -- --runInBand --runTestsByPath src/ai/__tests__/proposal-list-workflow.spec.ts
node --env-file=.env --test packages/database/dist/test/postgres-list-proposals.test.js
```

The PostgreSQL integration test uses session-local temporary tables and leaves application tables unchanged. It needs the existing `POSTGRES_URL`; without it the test is skipped. It covers date boundaries, stale stored status, terminal states, deployment/DAO scope, pagination, empty pages, and member/vote counts.
