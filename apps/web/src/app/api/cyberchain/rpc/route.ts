export const runtime = "nodejs";
const MAX_BODY = 65_536;

function error(status: number, code: number, message: string) {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return error(403, -32003, "RPC origin is not allowed.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return error(415, -32600, "Use application/json.");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY))
    return error(413, -32600, "RPC body is too large.");
  let endpoint: URL;
  try {
    const configured = process.env.DAO_API_ORIGIN;
    if (!configured && process.env.NODE_ENV === "production") throw new Error();
    endpoint = new URL(
      "/v1/cyberchain/rpc",
      configured ?? "http://127.0.0.1:3000",
    );
    if (
      endpoint.username ||
      endpoint.password ||
      !["http:", "https:"].includes(endpoint.protocol) ||
      (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:")
    )
      throw new Error();
  } catch {
    return error(503, -32000, "RPC gateway is not configured securely.");
  }
  const reader = request.body?.getReader();
  if (!reader) return error(400, -32700, "Invalid JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const deadline = AbortSignal.timeout(5_000);
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  deadline.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (deadline.aborted) return error(408, -32600, "RPC body timed out.");
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY) return error(413, -32600, "RPC body is too large.");
      chunks.push(chunk.value);
    }
  } catch {
    return error(400, -32700, "Invalid JSON.");
  } finally {
    deadline.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try {
    JSON.parse(body);
  } catch {
    return error(400, -32700, "Invalid JSON.");
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = request.headers.get("authorization");
    if (token) {
      if (token.length > 2048)
        return error(401, -32001, "Invalid wallet session.");
      headers.Authorization = token;
    }
    if (origin) headers.Origin = origin;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(response.headers.has("retry-after")
          ? { "Retry-After": response.headers.get("retry-after")! }
          : {}),
      },
    });
  } catch {
    return error(502, -32000, "RPC gateway is unavailable.");
  }
}
