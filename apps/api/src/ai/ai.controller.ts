import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OllamaClient } from './ollama.client';
import { LlmOnlySystem } from './llm-only.system';
import { VectorRagSystem } from './vector-rag.system';
import { VectorSearchService } from './vector-search.service';
import { PostgresService } from '../database/postgres.service';
import { AiHealthResponse, type AiQueryRequest, type AiQueryResponse } from './ai.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly llmOnly: LlmOnlySystem,
    private readonly vectorRag: VectorRagSystem,
    private readonly vectorSearch: VectorSearchService,
    private readonly postgres: PostgresService,
  ) {}

  @Get('health')
  async health(): Promise<AiHealthResponse> {
    const [ollamaHealth, postgresOk] = await Promise.all([
      this.ollama.healthCheck(),
      this.checkPostgres(),
    ]);

    return {
      status: ollamaHealth.status === 'healthy' && postgresOk ? 'ok' : 'degraded',
      ollama: {
        status: ollamaHealth.status,
        latencyMs: ollamaHealth.latencyMs,
        model: ollamaHealth.model,
        error: ollamaHealth.error,
      },
      postgres: postgresOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('query')
  @HttpCode(HttpStatus.OK)
  async query(@Body() request: AiQueryRequest): Promise<AiQueryResponse> {
    const runId = randomUUID();
    const startTime = Date.now();

    try {
      if (request.system === 'llm-only') {
        const result = await this.llmOnly.answer(request.question);
        const latencyMs = Date.now() - startTime;

        await this.recordRun(runId, request, result, 'llm-only', latencyMs, null, null);

        return {
          runId,
          system: 'llm-only',
          answer: result.answer,
          evidence: [],
          retrieval: [],
          latencyMs,
        };
      }

      if (request.system === 'vector-rag') {
        const result = await this.vectorRag.answer(
          request.question,
          request.proposalId,
          request.topK ?? 5,
        );
        const latencyMs = Date.now() - startTime;

        await this.recordRun(
          runId,
          request,
          result,
          'vector-rag',
          latencyMs,
          result.retrievalLatencyMs,
          result.generationLatencyMs,
        );

        return {
          runId,
          system: 'vector-rag',
          answer: result.answer,
          evidence: result.evidence.map((e) => ({
            chunkEvidenceId: e.chunkEvidenceId,
            artefactEvidenceId: e.artefactEvidenceId,
            proposalId: e.proposalId,
            filename: e.filename,
            content: e.content,
            score: e.score,
            rank: e.rank,
          })),
          retrieval: result.evidence.map((e) => ({
            chunkEvidenceId: e.chunkEvidenceId,
            score: e.score,
            rank: e.rank,
          })),
          latencyMs,
          retrievalLatencyMs: result.retrievalLatencyMs,
          generationLatencyMs: result.generationLatencyMs,
        };
      }

      throw new Error(`Unknown system: ${(request as any).system}`);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.recordRun(
        runId,
        request,
        { answer: '', latencyMs, inputTokens: undefined, outputTokens: undefined },
        request.system,
        latencyMs,
        null,
        null,
        errorMessage,
      );

      return {
        runId,
        system: request.system,
        answer: '',
        evidence: [],
        retrieval: [],
        latencyMs,
        error: errorMessage,
      };
    }
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.postgres.checkConnection();
      return true;
    } catch {
      return false;
    }
  }

  private async recordRun(
    runId: string,
    request: AiQueryRequest,
    result: { answer: string; latencyMs: number; inputTokens?: number; outputTokens?: number },
    system: 'llm-only' | 'vector-rag',
    totalLatencyMs: number,
    retrievalLatencyMs: number | null,
    generationLatencyMs: number | null,
    error?: string,
  ): Promise<void> {
    const db = this.postgres.database;

    try {
      await db.transaction().execute(async (tx) => {
        const run = await tx
          .insertInto('experiment_runs')
          .values({
            run_id: runId,
            system,
            dataset_version_id: BigInt(1),
            git_commit: 'dev',
            chat_model: this.ollama.getChatModel(),
            embedding_model: this.ollama.getEmbedModel(),
            embedding_dimension: this.ollama.getEmbedDimension(),
            seed: BigInt(0),
            configuration: JSON.stringify({
              proposalId: request.proposalId,
              topK: request.topK,
            }),
            started_at: new Date(Date.now() - totalLatencyMs),
            completed_at: new Date(),
            status: error ? 'ERROR' : 'COMPLETED',
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const question = await tx
          .insertInto('questions')
          .values({
            question_id: `q_${runId}`,
            proposal_id: request.proposalId ? BigInt(request.proposalId) : null,
            category: 'ai-query',
            question: request.question,
            canonical_answer: result.answer,
            required_evidence_ids: JSON.stringify([]),
            answerable: true,
            dataset_version_id: BigInt(1),
            metadata: JSON.stringify({}),
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        await tx.insertInto('answers').values({
          experiment_run_id: run.id,
          question_id: question.id,
          answer_text: result.answer,
          latency_ms: BigInt(result.latencyMs),
          input_tokens: result.inputTokens !== undefined ? BigInt(result.inputTokens) : null,
          output_tokens: result.outputTokens !== undefined ? BigInt(result.outputTokens) : null,
          error: error ?? null,
        }).execute();

        if (system === 'vector-rag' && !error) {
          const retrievalResults = await this.vectorSearch.search(request.question, {
            proposalId: request.proposalId,
            topK: request.topK ?? 5,
          });

          for (const [index, r] of retrievalResults.entries()) {
            await tx.insertInto('retrieval_results').values({
              experiment_run_id: run.id,
              question_id: question.id,
              rank: index + 1,
              evidence_id: r.chunkEvidenceId,
              retrieval_method: 'vector',
              score: r.score,
              metadata: JSON.stringify({
                artefactEvidenceId: r.artefactEvidenceId,
                proposalId: r.proposalId,
                filename: r.filename,
              }),
            }).execute();
          }
        }
      });
    } catch (recordError) {
      console.error('Failed to record AI run:', recordError);
    }
  }
}