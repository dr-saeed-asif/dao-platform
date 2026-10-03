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
import { PostgresService } from '../database/postgres.service';
import { AiHealthResponse, type AiQueryRequest, type AiQueryResponse } from './ai.dto';
import { MultiAgentSystem } from './agents/multi-agent.system';
import type { MultiAgentResponse } from './agents/agent.types';
import type { AgentContext } from './agents/agent.types';
import { ResearchRunsService } from '../research/research-runs.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly llmOnly: LlmOnlySystem,
    private readonly vectorRag: VectorRagSystem,
    private readonly postgres: PostgresService,
    private readonly runs: ResearchRunsService,
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
    let context: AgentContext | undefined;

    try {
      if (request.system === 'multi-agent' || request.system === 'hybrid' || request.system === 'hybrid-verified') {
        if (!this.multiAgent) throw new Error('Multi-agent system is unavailable.');
        context = await this.resolveAgentContext(request);
        const result = request.system === 'multi-agent'
          ? await this.multiAgent.execute(context)
          : await this.multiAgent.executeHybrid(context, request.system === 'hybrid-verified');
        await this.runs.record(request, context, result);
        return result;
      }
      if (request.system === 'llm-only') {
        const result = await this.llmOnly.answer(request.question);
        const latencyMs = Date.now() - startTime;

        const response = {
          runId,
          system: 'llm-only' as const,
          answer: result.answer,
          evidence: [],
          retrieval: [],
          latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
        await this.runs.record(request, undefined, response);
        return response;
      }

      if (request.system === 'vector-rag') {
        context = await this.resolveAgentContext(request);
        const result = await this.vectorRag.answer(
          request.question,
          context.localProposalId,
          request.topK ?? 5,
        );
        const latencyMs = Date.now() - startTime;

        const response = {
          runId,
          system: 'vector-rag' as const,
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
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
        await this.runs.record(request, context, response);
        return response;
      }

      throw new Error(`Unknown system: ${(request as any).system}`);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const response = {
        runId,
        system: request.system,
        answer: '',
        evidence: [],
        retrieval: [],
        latencyMs,
        error: errorMessage,
      };
      await this.runs.record(request, context, response, errorMessage);
      return response;
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

}
