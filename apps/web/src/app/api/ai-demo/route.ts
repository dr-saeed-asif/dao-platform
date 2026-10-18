/**
 * LOCAL DEVELOPMENT ONLY.
 * Explicitly allowlisted, password-protected bridge from Next.js to the
 * operator-only Python AI endpoint. NOT wallet authentication.
 * Do not enable it in production or on a publicly reachable dev server.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "cyber-security-dao|620bc74c-dde0-4532-9c4c-11e31b91983f",
  "cyber-governance-dao|d29a8227-da76-4a40-80a8-33300e1c4f04",
]);

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function safePasswordMatch(input: string, expected: string): boolean {
  // Digest lengths are constant, avoiding simple length-dependent comparison.
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.CYBERDAO_RAG_DEMO_ENABLED !== "true") {
    return jsonError(404, "Demo endpoint disabled.");
  }

  // The Next.js development server must be started with -H 127.0.0.1.
  // These are supplemental origin checks, NOT a public-facing security model.
  const host = request.headers.get("host") ?? "";
  if (host !== "127.0.0.1:3001" && host !== "localhost:3001") {
    return jsonError(403, "This demo must run on local port 3001.");
  }
  const origin = request.headers.get("origin");
  if (origin !== `http://${host}`) {
    return jsonError(403, "Same-origin browser request required.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return jsonError(415, "JSON request required.");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 10_000) {
    return jsonError(413, "Request too large.");
  }

  const expectedPassword = process.env.CYBERDAO_RAG_DEMO_PASSWORD ?? "";
  const serverToken = process.env.CYBERDAO_RAG_TOKEN ?? "";
  if (expectedPassword.length < 24 || serverToken.length < 24) {
    return jsonError(503, "Demo credentials are not configured on the server.");
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 10_000) return jsonError(413, "Request too large.");
    payload = JSON.parse(raw);
  } catch {
    return jsonError(400, "Malformed JSON.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonError(400, "Invalid request body.");
  }
  const input = payload as Record<string, unknown>;
  if (typeof input.password !== "string" || !safePasswordMatch(input.password, expectedPassword)) {
    return jsonError(401, "Incorrect demo password.");
  }
  if (typeof input.daoId !== "string" || typeof input.proposalId !== "string" ||
      !ALLOWED.has(`${input.daoId}|${input.proposalId}`)) {
    return jsonError(403, "Proposal not included in this local demo.");
  }
  if (typeof input.question !== "string" || input.question.trim().length < 3 || input.question.length > 2000) {
    return jsonError(422, "Enter a question between 3 and 2000 characters.");
  }
  if (input.system !== "hybrid" && input.system !== "vector-rag") {
    return jsonError(422, "Supported systems: hybrid, vector-rag.");
  }
  const topK = input.topK === undefined ? 4 : input.topK;
  if (typeof topK !== "number" || !Number.isInteger(topK) || topK < 1 || topK > 8) {
    return jsonError(422, "topK must be between 1 and 8.");
  }

  const backendUrl = process.env.CYBERDAO_RAG_URL ?? "http://127.0.0.1:8001";
  let endpoint: URL;
  try {
    endpoint = new URL("/v1/ai/query", backendUrl);
    if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1") {
      return jsonError(503, "Backend must be loopback HTTP for this demo.");
    }
  } catch {
    return jsonError(503, "Invalid backend URL.");
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        daoId: input.daoId,
        proposalId: input.proposalId,
        question: input.question.trim(),
        system: input.system,
        topK,
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    const response: unknown = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = response && typeof response === "object" && "detail" in response
        ? (response as { detail?: unknown }).detail : undefined;
      const safeDetail = typeof detail === "string" ? detail.slice(0, 250) : "Python AI request failed.";
      return jsonError(upstream.status >= 400 && upstream.status < 500 ? 422 : 502, safeDetail);
    }
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError(502, "Python AI is unavailable or took too long. Check port 8001 and Ollama.");
  }
}
