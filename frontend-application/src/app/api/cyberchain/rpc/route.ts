import { NextRequest, NextResponse } from "next/server";

const allowed = new Set([
  "eth_chainId",
  "eth_getRole",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_sendRawTransaction",
]);

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    method?: string;
    params?: unknown[];
  };
  if (!body.method || !allowed.has(body.method)) {
    return NextResponse.json(
      { error: { message: "Unsupported RPC method." } },
      { status: 400 },
    );
  }
  const rpcUrl =
    process.env.CYBERCHAIN_RPC_URL ??
    process.env.NEXT_PUBLIC_CYBERCHAIN_RPC_URL ??
    "http://cyberchain-bc.bisite.es:8545";
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: body.method,
      params: body.params ?? [],
    }),
    cache: "no-store",
  });
  const result = await response.json();
  return NextResponse.json(result, { status: response.ok ? 200 : 502 });
}
