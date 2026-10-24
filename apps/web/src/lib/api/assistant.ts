import { BrowserProvider } from "ethers";
import { injectedProvider } from "@/lib/wallet/injected-wallet";
export interface Source {
  source_id: string;
  content: unknown;
  metadata: Record<string, unknown>;
}
export interface AssistantResult {
  question_id: string;
  question: string;
  agent: string;
  status: string;
  answer?: string | null;
  citations: string[];
  cited_sources: Source[];
  errors: string[];
  execution?: ExecutionMetrics;
  blockchain_verification?: BlockchainVerification | null;
}
export interface Conversation {
  id: string;
  title: string | null;
  proposal_id: string;
  dao_id: string;
  updated_at: string;
}
export interface Message {
  id: string;
  role: string;
  content: string;
  metadata: { results?: AssistantResult[] };
}
export interface ProposalDocuments {
  linked_artefacts: Array<{
    evidence_id: string;
    filename: string;
    verification_status: string;
    lifecycle_state: string;
    status: string;
  }>;
  indexed_documents: Array<{ artefact_evidence_id: string; filename: string }>;
}
export interface AssistantEvent {
  event: string;
  conversation_id?: string;
  question_id?: string;
  data?: Record<string, unknown>;
  results?: AssistantResult[];
  status?: string;
  error?: string;
}
let session: { token: string; address: string; expires: number } | undefined;
const base = "/api/v1/ai/assistant";
async function checked(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    if (response.status === 401) session = undefined;
    throw new Error(value.message ?? `AI request failed (${response.status}).`);
  }
  return response;
}
const pendingSignIns = new Map<string, Promise<void>>();
export function signInAssistant(
  address: string,
  kind: "metamask" | "cyberchain" = "metamask",
): Promise<void> {
  const key = `${kind}:${address.toLowerCase()}`;
  const pending = pendingSignIns.get(key);
  if (pending) return pending;
  const attempt = authenticateAssistant(address, kind).finally(() =>
    pendingSignIns.delete(key),
  );
  pendingSignIns.set(key, attempt);
  return attempt;
}
async function authenticateAssistant(
  address: string,
  kind: "metamask" | "cyberchain",
) {
  if (
    session?.address === address.toLowerCase() &&
    session.expires > Date.now() + 5000
  )
    return;
  // Reuse the selected wallet. Never call connect(), request accounts, or switch providers.
  let proof: { signature?: string; signedTransaction?: string };
  if (kind === "cyberchain") {
    const wallet = window.CyberChainWallet;
    if (!wallet)
      throw new Error(
        "The connected CyberChain wallet is unavailable. Unlock the wallet and retry verification.",
      );
    const current = await wallet.requestWalletAddress();
    if (
      !current.connected ||
      current.address.toLowerCase() !== address.toLowerCase()
    )
      throw new Error(
        "The CyberChain wallet account changed. Select the connected account in your wallet.",
      );
    const challenge = await (
      await checked("/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address, kind }),
      })
    ).json();
    const signed = await wallet.sign(challenge.transaction);
    if (!signed)
      throw new Error(
        "Wallet verification was cancelled. Your wallet is still connected.",
      );
    proof = {
      signedTransaction: signed.startsWith("0x") ? signed : `0x${signed}`,
    };
    session = await (
      await checked("/auth/login", {
        method: "POST",
        body: JSON.stringify({ nonce: challenge.nonce, ...proof }),
      })
    ).json();
    return;
  }
  const provider = injectedProvider();
  if (!provider)
    throw new Error(
      "The connected wallet is unavailable. Unlock it and retry verification.",
    );
  const challenge = await (
    await checked("/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ address, kind }),
    })
  ).json();
  const signer = await new BrowserProvider(provider).getSigner(address);
  const signature = await signer.signMessage(challenge.message);
  session = await (
    await checked("/auth/login", {
      method: "POST",
      body: JSON.stringify({ nonce: challenge.nonce, signature }),
    })
  ).json();
}
function headers(address: string) {
  if (
    !session ||
    session.address !== address.toLowerCase() ||
    session.expires <= Date.now()
  )
    throw new Error("AI session expired. Sign in with your wallet again.");
  return { Authorization: `Bearer ${session.token}` };
}
export async function assistantJson<T>(
  path: string,
  address: string,
  body?: unknown,
): Promise<T> {
  return (
    await checked(path, {
      headers: headers(address),
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
    })
  ).json();
}
export async function streamAssistant(
  address: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: AssistantEvent) => void,
) {
  const response = await checked("/ask/stream", {
    method: "POST",
    headers: headers(address),
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(610_000)]),
  });
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  )
    throw new Error("AI server returned an invalid response stream.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    completed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = frame.split("\n");
        const name = lines
          .find((line) => line.startsWith("event:"))
          ?.slice(6)
          .trim();
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || name === "ping") continue;
        const value = JSON.parse(data) as AssistantEvent;
        value.event = name ?? value.event;
        if (value.event === "run_error")
          throw new Error(
            value.error ?? String(value.data?.error ?? "AI execution failed."),
          );
        onEvent(value);
        if (value.event === "run_complete") completed = true;
      }
      if (chunk.done) break;
    }
    if (!completed)
      throw new Error(
        "AI connection ended before completion. Reopen the conversation to check saved results.",
      );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export type VerificationStatus =
  "verified" | "mismatched" | "unavailable" | "unverified";
export interface BlockchainVerification {
  status: VerificationStatus;
  dao_id: string;
  proposal_id: string;
  on_chain_id: string | null;
  chain_id: string;
  contract: string;
  block_number?: string;
  block_hash?: string;
  observed_at: string;
  proposal?: Record<string, unknown>;
  voting_status?: string;
  vote_counts?: string[];
  comparisons: Array<{
    field: string;
    status: VerificationStatus;
    database: unknown;
    blockchain: unknown;
    reason?: string;
  }>;
  events: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  errors: string[];
  scope: string;
}
export interface ExecutionSpan {
  span_id: string;
  question_id: string;
  kind: string;
  name: string;
  agent: string;
  started_at: string;
  completed_at?: string;
  latency_ms?: number;
  status: string;
  selected_agent?: string;
  model?: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  attempt?: number;
  error_type?: string;
  citations?: string[];
}
export interface ExecutionMetrics {
  started_at?: string;
  completed_at?: string;
  agents?: string[];
  tools?: string[];
  models?: string[];
  input_tokens?: number | null;
  output_tokens?: number | null;
  embedding_tokens?: number | null;
  latency_ms?: number;
  llm_ms?: number;
  tool_ms?: number;
  agent_ms?: number;
  retrieval_ms?: number;
  tool_calls?: number;
  tool_successes?: number;
  retries?: number;
  trace?: ExecutionSpan[];
}
