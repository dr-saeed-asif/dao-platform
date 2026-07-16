import type {
  Assignment,
  CreateProposalInput,
  PreparedTransaction,
  Proposal,
  Vote,
  ChainTransaction,
} from "./types";

const baseUrl = "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new ApiError(
      String(body.message ?? "Request failed."),
      response.status,
      body.code as string | undefined,
    );
  }
  return body as T;
}

const actorHeaders = (address: string) => ({ "x-wallet-address": address });

export const daoApi = {
  listProposals: () => request<{ items: Proposal[] }>("/proposals?limit=100"),
  createProposal: (input: CreateProposalInput, actor: string) =>
    request<{ proposal: Proposal; transaction: PreparedTransaction }>(
      "/proposals",
      {
        method: "POST",
        headers: {
          ...actorHeaders(actor),
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      },
    ),
  publishProposal: (id: string, actor: string) =>
    request(`/proposals/${id}/publish`, {
      method: "POST",
      headers: actorHeaders(actor),
    }),
  cancelProposal: (id: string, actor: string) =>
    request(`/proposals/${id}/cancel`, {
      method: "POST",
      headers: actorHeaders(actor),
    }),
  finalizeProposal: (id: string, actor: string) =>
    request(`/proposals/${id}/finalize`, {
      method: "POST",
      headers: actorHeaders(actor),
    }),
  listMembers: (id: string) =>
    request<Assignment[]>(`/proposals/${id}/members`),
  assignMembers: (id: string, members: string[], actor: string) =>
    request(`/proposals/${id}/members`, {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ memberAddresses: members }),
    }),
  unassignMember: (id: string, member: string, actor: string) =>
    request(`/proposals/${id}/members/${member}`, {
      method: "DELETE",
      headers: actorHeaders(actor),
    }),
  prepareVote: (id: string, optionIndex: number, actor: string) =>
    request<PreparedTransaction>(`/proposals/${id}/votes/prepare`, {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ optionIndex }),
    }),
  confirmVote: (id: string, transactionHash: string, actor: string) =>
    request(`/proposals/${id}/votes/confirm`, {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ transactionHash }),
    }),
  listVotes: (id: string) => request<Vote[]>(`/proposals/${id}/votes`),
  listTransactions: (id: string) =>
    request<ChainTransaction[]>(`/proposals/${id}/transactions`),
  syncVotes: (actor: string) =>
    request("/proposals/sync/votes", {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ full: false }),
    }),
};
