import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OllamaClient } from './ollama.client';
import { LlmOnlySystem } from './llm-only.system';
import { VectorRagSystem } from './vector-rag.system';
import { VectorSearchService } from './vector-search.service';
import { PostgresService } from '../database/postgres.service';
import { AiHealthResponse, type AiQueryRequest, type AiQueryResponse } from './ai.dto';
import { MultiAgentSystem } from './agents/multi-agent.system';
import type { MultiAgentResponse } from './agents/agent.types';
import type { AgentContext } from './agents/agent.types';

@Controller('ai')
export class AiController {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly llmOnly: LlmOnlySystem,
    private readonly vectorRag: VectorRagSystem,
    private readonly vectorSearch: VectorSearchService,
    private readonly postgres: PostgresService,
    @Optional() private readonly multiAgent?: MultiAgentSystem,
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
  async query(@Body() request: AiQueryRequest): Promise<AiQueryResponse | MultiAgentResponse> {
    const runId = randomUUID();
    const startTime = Date.now();

    try {
      if (request.system === 'multi-agent') {
        if (!this.multiAgent) throw new Error('Multi-agent system is unavailable.');
        const context = await this.resolveAgentContext(request);
        const result = await this.multiAgent.execute(context);
        await this.recordRun(result.runId, request, { answer: result.answer, latencyMs: result.latencyMs }, 'multi-agent', result.latencyMs, null, null, undefined, result);
        return result;
      }
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
        const context = await this.resolveAgentContext(request);
        const result = await this.vectorRag.answer(
          request.question,
          context.localProposalId,
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

  private async resolveAgentContext(request: AiQueryRequest): Promise<AgentContext> {
    const explicitId = request.question.match(/\bproposal\s+(?:#?(\d+)|([0-9a-f]{8}-[0-9a-f-]{27,}))\b/i)?.slice(1).find(Boolean);
    const requestedId = request.proposalId ?? explicitId;
    let proposal: Awaited<ReturnType<AiController['findProposal']>>;

    if (requestedId) proposal = await this.findProposal(requestedId);
    if (request.proposalId && !proposal) throw new Error(`Proposal not found: ${request.proposalId}`);

    let scopeConflict: string | undefined;
    if (request.proposalId && explicitId && proposal) {
      const explicitProposal = await this.findProposal(explicitId);
      if (!explicitProposal || explicitProposal.id !== proposal.id) {
        const selected = proposal.on_chain_id ?? proposal.id;
        scopeConflict = `Your selected proposal is #${selected} but your question refers to #${explicitId}. Please choose one.`;
      }
    }

    return {
      question: request.question,
      proposalId: proposal?.id,
      localProposalId: proposal?.id,
      onChainProposalId: proposal?.on_chain_id ?? undefined,
      chainId: proposal?.chain_id,
      contractAddress: proposal?.contract_address,
      datasetVersion: request.datasetVersion,
      policyVersion: request.policyVersion,
      topK: Math.max(1, Math.min(request.topK ?? 5, 20)),
      scopeConflict,
    };
  }

  private findProposal(id: string) {
    let query = this.postgres.database
      .selectFrom('proposals')
      .select(['id', 'on_chain_id', 'chain_id', 'contract_address']);
    query = /^\d+$/.test(id)
      ? query.where((eb) => eb.or([eb('id', '=', id), eb('on_chain_id', '=', id)]))
      : query.where('id', '=', id);
    return query.executeTakeFirst();
  }

  private async recordRun(
    runId: string,
    request: AiQueryRequest,
    result: { answer: string; latencyMs: number; inputTokens?: number; outputTokens?: number },
    system: 'llm-only' | 'vector-rag' | 'multi-agent',
    totalLatencyMs: number,
    retrievalLatencyMs: number | null,
    generationLatencyMs: number | null,
    error?: string,
    rawOutput?: MultiAgentResponse,
  ): Promise<void> {
    const db = this.postgres.database;

    try {
      await db.transaction().execute(async (tx) => {
        const run = await tx
          .insertInto('experiment_runs')
          .values({
            run_id: runId,
            system,
            dataset_version_id: null,
            git_commit: 'dev',
            chat_model: this.ollama.getChatModel(),
            embedding_model: this.ollama.getEmbedModel(),
            embedding_dimension: this.ollama.getEmbedDimension(),
            seed: BigInt(0),
            configuration: JSON.stringify({
              proposalId: request.proposalId,
              topK: request.topK,
              datasetVersion: request.datasetVersion,
              policyVersion: request.policyVersion,
              ...(rawOutput ? { agentsUsed: rawOutput.agentsUsed, toolsUsed: rawOutput.toolsUsed, agentTrace: rawOutput.agentTrace, verification: rawOutput.verification, abstention: rawOutput.abstained, errors: rawOutput.errors } : {}),
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
            proposal_id: /^\d+$/.test(request.proposalId ?? '') ? BigInt(request.proposalId!) : null,
            category: 'ai-query',
            question: request.question,
            canonical_answer: result.answer,
            required_evidence_ids: JSON.stringify([]),
            answerable: true,
            dataset_version_id: null,
            metadata: JSON.stringify(rawOutput ? { system: 'multi-agent' } : {}),
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const answer = await tx.insertInto('answers').values({
          experiment_run_id: run.id,
          question_id: question.id,
          answer_text: result.answer,
          latency_ms: BigInt(result.latencyMs),
          input_tokens: result.inputTokens !== undefined ? BigInt(result.inputTokens) : null,
          output_tokens: result.outputTokens !== undefined ? BigInt(result.outputTokens) : null,
          error: error ?? null,
          raw_output: rawOutput ? JSON.stringify(rawOutput) : null,
        }).returning('id').executeTakeFirstOrThrow();

        if (rawOutput) {
          for (const [index, claim] of rawOutput.claims.entries()) {
            const verified = rawOutput.verification.claims[index];
            await tx.insertInto('claims').values({ answer_id: answer.id, claim_index: index, claim_text: claim.text, evidence_ids: JSON.stringify(claim.evidenceIds), support_status: verified?.status ?? 'UNSUPPORTED', verification_details: JSON.stringify(verified ?? {}) }).execute();
          }
        }

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
