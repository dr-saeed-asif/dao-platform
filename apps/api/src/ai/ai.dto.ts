import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AiBatchQueryRequest {
  @IsString() @MinLength(1) @MaxLength(120)
  proposalId!: string;

  @IsIn(['hybrid', 'vector-rag', 'fixed-workflow'])
  system!: 'hybrid' | 'vector-rag' | 'fixed-workflow';

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true }) @Matches(/\S/, { each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true })
  questions!: string[];

  @IsOptional() @IsInt() @Min(1) @Max(8)
  topK?: number;
}

export interface AiBatchQueryResponse {
  batchId: string;
  system: AiBatchQueryRequest['system'];
  status: 'completed' | 'partial' | 'failed';
  scope: { dao_id: string; proposal_id: string };
  combinedAnswer?: string;
  combinedStatus?: 'completed' | 'partial' | 'failed';
  combinedCitations?: Array<Record<string, unknown>>;
  combinedEvidence?: unknown[];
  combinedErrors?: Array<Record<string, unknown>>;
  results: Array<{
    questionId: string; question: string; answer: string; status: string;
    citations: Array<Record<string, unknown>>; evidence: unknown[]; errors: Array<Record<string, unknown>>;
    metrics: Record<string, unknown>;
  }>;
  evidence: unknown[];
  errors: Array<Record<string, unknown>>;
  toolErrors: Array<Record<string, unknown>>;
  toolTraces: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
}

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
    evidenceId?: string;
    sourceType?: string;
    data?: unknown;
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
  inputTokens?: number;
  outputTokens?: number;
  toolTraces?: Array<Record<string, unknown>>;
  models?: { chat: string; embedding: string; embeddingDimension: number };
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
