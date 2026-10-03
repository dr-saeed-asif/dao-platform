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

export type ResearchSystem = 'hybrid'|'hybrid-verified'|'multi-agent';
export interface AiQueryRequest {
  question: string;
  proposalId?: string;
  system: ResearchSystem | 'llm-only' | 'vector-rag';
  topK?: number;
  datasetVersion?: string;
  policyVersion?: string;
}

export interface AiQueryResponse {
  runId: string;
  system: ResearchSystem | 'llm-only' | 'vector-rag';
  answer: string;
  evidence: Array<{
    chunkEvidenceId?: string;
    artefactEvidenceId?: string;
    evidenceId?: string;
    sourceType?: string;
    proposalId: string | null;
    filename?: string | null;
    content?: string;
    score?: number;
    rank?: number;
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
  agentsUsed?: string[];
  toolsUsed?: string[];
  claims?: Array<{text:string;type:string;evidenceIds:string[]}>;
  verification?: {status:string;claims:Array<{status:string;reasons:string[]}>;correctionRounds:number};
  agentTrace?: Array<{agent:string;action?:string;tool?:string;status:string;evidenceIds:string[];latencyMs:number;error?:string}>;
  abstained?: boolean;
  llmCalls?: number;
  embeddingCalls?: number;
  errors?: string[];
  inputTokens?: number;
  outputTokens?: number;
}

export interface ResearchRunSummary {runId:string;createdAt:string;proposalId:string|null;onChainProposalId:string|null;system:string;question:string;verificationStatus:string|null;abstained:boolean;evidenceCount:number;retrievalCount:number;supportedClaims:number;unsupportedClaims:number;latencyMs:number;tokens:number;status:string;error:string|null;answer:string;agentsUsed:string[]}
export interface ResearchRunDetail extends ResearchRunSummary {models:{chat:string|null;embedding:string|null;embeddingDimension:number|null};datasetVersion:string|null;policyVersion:string|null;evidence:AiQueryResponse['evidence'];evidenceIds:string[];retrieval:unknown[];claims:unknown[];verification:unknown;toolsUsed:string[];agentTrace:AiQueryResponse['agentTrace'];errors:string[]}

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
