import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export type AiQuerySystem = 'hybrid' | 'vector-rag';

export class AiQueryRequest {
  @IsString() @Matches(/\S/) @MinLength(3) @MaxLength(200)
  question!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  proposalId!: string;

  @IsIn(['hybrid', 'vector-rag'])
  system!: AiQuerySystem;

  @IsOptional() @IsInt() @Min(1) @Max(8)
  topK?: number;
}

export class AiBatchQueryRequest {
  @IsString() @MinLength(1) @MaxLength(120)
  proposalId!: string;

  @IsIn(['hybrid', 'vector-rag', 'fixed-workflow'])
  system!: 'hybrid' | 'vector-rag' | 'fixed-workflow';

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true }) @Matches(/\S/, { each: true }) @MinLength(3, { each: true }) @MaxLength(200, { each: true })
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
    questionId: string;
    question: string;
    answer: string;
    status: string;
    citations: Array<Record<string, unknown>>;
    evidence: unknown[];
    errors: Array<Record<string, unknown>>;
    metrics: Record<string, unknown>;
  }>;
  evidence: unknown[];
  errors: Array<Record<string, unknown>>;
  toolErrors: Array<Record<string, unknown>>;
  toolTraces: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
}

export interface AiQueryResponse {
  runId: string;
  system: AiQuerySystem;
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
  retrieval: Array<{ chunkEvidenceId: string; score: number; rank: number }>;
  latencyMs: number;
  retrievalLatencyMs?: number;
  generationLatencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolTraces?: Array<Record<string, unknown>>;
  models?: { chat: string; embedding: string; embeddingDimension: number };
  claims?: Array<{ text: string; type?: string; evidenceIds: string[] }>;
  verification?: { status: string; claims?: Array<Record<string, unknown>>; correctionRounds?: number };
  agentsUsed?: string[];
  toolsUsed?: string[];
  agentTrace?: Array<Record<string, unknown>>;
  abstained?: boolean;
  errors?: string[];
  error?: string;
  timings?: { upstreamMs: number; persistenceMs: number; serverTotalMs: number };
}

export type AiHealthResponse = Record<string, unknown>;
