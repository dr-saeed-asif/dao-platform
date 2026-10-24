# CyberDAO API

The NestJS/Fastify API exposes governance, research artefact, and AI proxy
routes under `/v1`.

## AI Boundary

NestJS does not run models, agents, tools, embeddings, or RAG. It forwards AI
work to `api-ai-server` using server-only credentials:

```text
Browser -> Next.js /api rewrite -> NestJS /v1/ai -> api-ai-server
```

Routes:

- `GET /v1/ai/health`
- `POST /v1/ai/query`
- `POST /v1/ai/query/batch`

Nest validates requests, resolves the selected proposal and DAO from
PostgreSQL, forwards the trusted scope, normalizes single-query responses, and
records successful single queries in research history. Linked PDFs are sent to
`api-ai-server` by the research service for indexing.

Required AI configuration:

```dotenv
AI_SERVER_URL=http://127.0.0.1:8001
AI_SERVER_TOKEN=replace-with-the-api-ai-server-token
```

The current integration intentionally accepts a loopback HTTP AI server only.

## Commands

Run from the repository root:

```powershell
npm run dev:api
npm run build --workspace=api
npm run test --workspace=api
```
