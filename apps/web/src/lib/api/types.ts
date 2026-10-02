export interface ProposalOption {
  index: number;
  label: string;
}
export interface Proposal {
  id: string;
  daoId: string;
  onChainId: string | null;
  creatorAddress: string;
  title: string;
  purpose: string;
  description: string;
  type: string;
  status: string;
  options: ProposalOption[];
  startsAt: string;
  endsAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface PreparedTransaction {
  chainId: string;
  from: string;
  to: string;
  data: string;
  value: string;
}
export interface CreateProposalInput {
  daoId: string;
  title: string;
  purpose: string;
  description: string;
  type: string;
  optionLabels: string[];
  startsAt: string;
  endsAt: string;
  metadataURI: string;
  metadataHash: string;
}
export interface Assignment {
  proposalId: string;
  walletAddress: string;
  transactionHash: string;
  assignedAt: string;
}
export interface Vote {
  proposalId: string;
  onChainProposalId: string;
  voterAddress: string;
  optionIndex: number;
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  gasUsed: string;
  confirmedAt: string;
}
export interface ChainTransaction {
  transactionHash: string;
  operation:
    | "CREATE_PROPOSAL"
    | "ASSIGN_MEMBERS"
    | "UNASSIGN_MEMBER"
    | "CAST_VOTE"
    | "CANCEL_PROPOSAL"
    | "FINALIZE_PROPOSAL";
  proposalId: string;
  walletAddress: string;
  blockNumber: string;
  blockHash: string;
  gasUsed: string;
  status: "CONFIRMED";
  recordedAt: string;
}
export interface Artefact {
  evidence_id: string;
  filename: string | null;
  media_type: string | null;
  byte_size: string | null;
  computed_hash: string | null;
  verification_status: string;
  lifecycle_state: string;
  uri: string;
}

export interface AiQueryRequest {
  question: string;
  proposalId?: string;
  system: 'llm-only' | 'vector-rag';
  topK?: number;
}

export interface AiQueryResponse {
  runId: string;
  system: 'llm-only' | 'vector-rag';
  answer: string;
  evidence: Array<{
    chunkEvidenceId: string;
    artefactEvidenceId: string;
    proposalId: string | null;
    filename: string | null;
    content: string;
    score: number;
    rank: number;
  }>;
  retrieval: Array<{
    chunkEvidenceId: string;
    score: number;
    rank: number;
  }>;
  latencyMs: number;
  retrievalLatencyMs?: number;
  generationLatencyMs?: number;
  error?: string;
}

export interface AiHealthResponse {
  status: 'ok' | 'degraded';
  ollama: {
    status: 'healthy' | 'unhealthy';
    latencyMs: number;
    model?: string;
    error?: string;
  };
  postgres: 'ok' | 'error';
  timestamp: string;
}
