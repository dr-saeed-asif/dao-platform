# CyberDAO: 5–7 hour frontend integration fast track

## Purpose

**Working local demo today, not production access.** Existing Python FastAPI RAG is already verified with 24 unit tests and a live compatibility endpoint. This ZIP adds **a real page inside your existing Next.js frontend** at `/ai-demo` and a **server-only Next.js proxy** at `/api/ai-demo`, forwarding to the Python `POST /v1/ai/query`. The existing frontend components/AI screen and DAO backend are NOT modified.

### Architecture

```text
Browser (localhost:3001/ai-demo)
  └─ password + question + allowlisted proposal
       → Next.js server route /api/ai-demo
           → verifies local development mode, origin, demo password, proposal allowlist
           → adds Python RAG_DEV_TOKEN server-side (never to browser)
               → Python FastAPI (127.0.0.1:8001/v1/ai/query)
                   → PostgreSQL proposal + linked verified PDFs, pgvector, Ollama
               ← {answer, G1/D1 evidence, timings, runId}
       ← renders answer, references and latency
```

CyberChain wallet login is **not** added. This is operator demo access only. Do not deploy or proxy it to the internet. No modifications to NestJS/legacy governance tables or Python modules.

## 1. Install with two commands

**Back up/commit your existing frontend** first. Download `cyberdao_frontend_fasttrack.zip` to Downloads. Open PowerShell:

```powershell
cd E:\DAO\cyber-chain-work\dao-platform
Expand-Archive -Path "$HOME\Downloads\cyberdao_frontend_fasttrack.zip" -DestinationPath . -Force
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup_frontend_demo.ps1
```

The script reads your private Python `api-ai-server/.env` on your computer, writes four **server-only** values to `dao-platform/apps/web/.env.local` (backs it up first), and **prints a newly generated local demo password**. Do not paste either `.env` file into chat. The demo password is not your wallet key and does not need wallet signing.

The script creates no database tables and overwrites no existing AI/RAG Python files. If you already have an `apps/web/src/app/ai-demo` route, review it before extraction.

## 2. Run services locally

**Python server:** in one PowerShell terminal:

```powershell
cd E:\DAO\cyber-chain-work\api-ai-server
.\.venv\Scripts\python.exe run_rag.py
```

It serves FastAPI at http://127.0.0.1:8001/docs. Keep PostgreSQL and Ollama running as you already do.

**Next.js:** stop/restart the existing frontend so it loads `.env.local`. Make sure it is bound to loopback, not your LAN. If `pnpm` is your installed frontend package manager, one option from the web directory is:

```powershell
cd E:\DAO\cyber-chain-work\dao-platform\apps\web
pnpm exec next dev -p 3001 -H 127.0.0.1
```

If that doesn't match your monorepo scripts, use your existing frontend dev command but force the listen host to `127.0.0.1` and port `3001`. There must be no existing process on port 3001.

Open: **http://127.0.0.1:3001/ai-demo**. Type the demo password shown by the setup script. Pick a verified proposal (security or governance), use `hybrid`, ask your question. You should see an answer, governance and PDF citations, filenames/page numbers and latency.

## 3. Verify the complete HTTP path

In a third terminal (both servers running):

```powershell
cd E:\DAO\cyber-chain-work\dao-platform
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke_frontend_demo.ps1
```

Expected:

```text
PASS: Wrong operator password -> HTTP 401
PASS: Unapproved DAO/proposal -> HTTP 403
PASS: Next.js -> FastAPI -> PostgreSQL/Ollama -> Next.js: HTTP 200
PASS: Both G1 and D1 evidence returned
=== LOCAL FRONTEND INTEGRATION SMOKE TEST PASSED ===
```

If Next.js already runs at **localhost** instead of 127.0.0.1, use `-BaseUrl "http://localhost:3001"` for the smoke script; use the matching URL in the browser.

## 4. What this changes / does NOT change

New files:

- `apps/web/src/app/ai-demo/page.tsx`: Next.js client UI for local proposal questions.
- `apps/web/src/app/api/ai-demo/route.ts`: protected, allowlisted, server-only Python forwarder.
- `scripts/setup_frontend_demo.ps1`: local credentials/environment setup.
- `scripts/smoke_frontend_demo.ps1`: cross-stack HTTP smoke test.

**Does NOT change:** old `daoApi.aiQuery` API client, existing Next.js AI page, NestJS routes, wallet adapters, `app/main.py`, your Python RAG index. To replace the *existing* AI tab rather than provide a dedicated integrated demo page, we need to inspect the file containing the existing UI or make a follow-up one-file change there.

## 5. Scope and safety

- Allowed proposals are explicitly limited to the two verified demonstration samples, so a guessed proposal ID cannot open other governance documents.
- Demo password is checked server-side; the Python RAG token is in Next.js server environment only. Never use `NEXT_PUBLIC_` for these values.
- Both servers should only be accessible on loopback. The Next.js proxy is disabled unless `NODE_ENV=development` and `CYBERDAO_RAG_DEMO_ENABLED=true`. Its host/origin and token checks are supplementary protections, **not secure wallet authentication**.
- Do not expose the demo to other users or deploy it to production. A signed wallet challenge + proposal assignment enforcement will be required before user-facing protected PDF access.
- Citation markers identify retrieved passages; claim-level validation is not implemented. Proposal `ACTIVE` database status may be stale.
- Latency metrics shown are live request measurements, not an experiment tracking dataset.

## 6. Troubleshooting

- **404 on /ai-demo:** Confirm the ZIP extracted to the *dao-platform* root, Next App Router is at `apps/web/src/app`, and restart Next.js.
- **404 on /api/ai-demo:** Confirm `NODE_ENV=development`, `.env.local` contains `CYBERDAO_RAG_DEMO_ENABLED=true`, and restart Next.js.
- **403 on local URL:** Use `http://127.0.0.1:3001` or `http://localhost:3001` consistently (same host for request and Origin). Use Next's loopback binding.
- **401 on ask:** Enter the *demo password* printed by `setup_frontend_demo.ps1`, NOT `RAG_DEV_TOKEN`.
- **502:** Confirm FastAPI on port 8001 and Ollama running, with `OLLAMA_CHAT_MODEL=qwen3:4b-instruct` in Python `.env`.
- **TypeScript build error:** Share the exact error and your Next.js frontend directory structure. The package was statically inspected and syntax-checked but has not run against your private Next.js workspace.

## Timeboxed target

1. Frontend integration + setup: ~60–90 min.
2. Live browser and HTTP testing: ~60 min.
3. Demonstrate hybrid vs vector-rag and latency: ~30–60 min.
4. Fix actual integration issues and record proof: remaining time.

Do **not** start MCP, multi-agent infrastructure, new vector migrations, or frontend cutover until the current local end-to-end demo works.
