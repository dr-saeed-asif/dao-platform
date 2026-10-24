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

export type ResearchSystem = 'hybrid'|'vector-rag';
export interface AiQueryRequest {
  question: string;
  proposalId: string;
  system: ResearchSystem;
  topK?: number;
}

export interface AiQueryResponse {
  runId: string;
  system: ResearchSystem;
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
  toolTraces?: Array<{ tool?: string; arguments?: Record<string, unknown>;
    success?: boolean; source_ids?: string[]; duration_ms?: number; outcome?: string }>;
}

export type AiBatchSystem = "hybrid" | "vector-rag" | "fixed-workflow";
export interface AiBatchQueryRequest {
  proposalId: string;
  system: AiBatchSystem;
  questions: string[];
  topK?: number;
}
export interface AiBatchQueryResponse {
  batchId: string;
  system: AiBatchSystem;
  status: "completed" | "partial" | "failed";
  scope: { dao_id: string; proposal_id: string };
  combinedAnswer?: string;
  combinedStatus?: "completed" | "partial" | "failed";
  combinedCitations?: Array<{ source_id: string; source_type: string; filename?: string | null;
    page_number?: number | null; transaction_hash?: string | null; block_number?: number | null }>;
  combinedEvidence?: Array<{ tool_call_id?: string; source_type?: string; data?: unknown }>;
  combinedErrors?: Array<{ code?: string; type?: string; message?: string }>;
  results: Array<{
    questionId: string; question: string; answer: string; status: string;
    citations: Array<{ source_id: string; source_type: string; filename?: string | null;
      page_number?: number | null; transaction_hash?: string | null; block_number?: number | null }>;
    evidence: Array<{ tool_call_id?: string; source_type?: string; data?: unknown }>;
    errors: Array<{ code?: string; type?: string; message?: string }>;
    metrics: {
      totalLatencyMs?: number; generationLatencyMs?: number; toolDurationSumMs?: number;
      postgresLatencyMs?: number; blockchainRpcLatencyMs?: number; pdfVectorLatencyMs?: number;
      embeddingLatencyMs?: number; inputTokens?: number | null; outputTokens?: number | null;
      totalTokens?: number | null; outputTokensPerSecond?: number | null;
      toolInvocationCount?: number; citationCount?: number; evidenceSources?: string[];
      toolNames?: string[]; sourceCombination?: string | null; toolOutcomes?: Array<{
        tool: string; durationMs: number; outcome?: string; errorCode?: string | null }>;
    };
  }>;
  evidence: unknown[];
  errors: Array<{ questionId?: string; code?: string; message?: string }>;
  toolErrors: Array<{ questionId?: string; code?: string; message?: string }>;
  toolTraces: Array<{ toolCallId?: string; tool_call_id?: string; tool?: string;
    arguments?: Record<string, unknown>; sourceType?: string; source_type?: string;
    questionIds?: string[]; question_ids?: string[]; success?: boolean;
    sourceIds?: string[]; source_ids?: string[]; durationMs?: number;
    outcome?: string; errorCode?: string; start_offset_ms?: number; provenance?: unknown[] }>;
  metrics: {
    questionCount?: number; latencyMs?: number; generationLatencyMs?: number;
    generationWallMs?: number; toolWallMs?: number; toolDurationSumMs?: number;
    model?: string; embeddingModel?: string; embeddingProfile?: string | null;
    postgresLatencyMs?: number; blockchainRpcLatencyMs?: number; pdfVectorLatencyMs?: number;
    embeddingLatencyMs?: number; inputTokens?: number | null; outputTokens?: number | null;
    totalTokens?: number | null; outputTokensPerSecond?: number | null;
    toolInvocationCount?: number; toolCalls?: Array<{ tool?: string; duration_ms?: number;
      start_offset_ms?: number | null; outcome?: string; error_code?: string | null;
      question_ids?: string[]; embedding_ms?: number | null; retrieval_ms?: number | null }>;
    sourceCombination?: string | null;
  };
}

export interface ResearchRunSummary {runId:string;createdAt:string;proposalId:string|null;onChainProposalId:string|null;system:string;question:string;verificationStatus:string|null;abstained:boolean;evidenceCount:number;retrievalCount:number;supportedClaims:number;unsupportedClaims:number;latencyMs:number;inputTokens?:number;outputTokens?:number;tokens:number|null;status:string;error:string|null;answer:string;agentsUsed:string[]}
export interface ResearchRunDetail extends ResearchRunSummary {models:{chat:string|null;embedding:string|null;embeddingDimension:number|null};datasetVersion:string|null;policyVersion:string|null;evidence:AiQueryResponse['evidence'];evidenceIds:string[];retrieval:unknown[];claims:unknown[];verification:unknown;toolsUsed:string[];agentTrace:AiQueryResponse['agentTrace'];errors:string[];rawOutput?:Record<string,unknown>}

export type AiHealthResponse = Record<string, unknown>;
