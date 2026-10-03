export interface AiQueryRequest {
  question: string;
  proposalId?: string;
  system: 'hybrid' | 'hybrid-verified' | 'multi-agent' | 'llm-only' | 'vector-rag';
  topK?: number;
  datasetVersion?: string;
  policyVersion?: string;
}

export interface AiQueryResponse {
  runId: string;
  system: 'hybrid' | 'hybrid-verified' | 'multi-agent' | 'llm-only' | 'vector-rag';
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
