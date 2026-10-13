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
