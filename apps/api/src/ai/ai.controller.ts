import { withRequestBudget, checkRequestBudget, analysisTimeoutMs, AI_PERSISTENCE_GRACE_MS, requestSignal } from './request-budget';
import { ConfigService } from '@nestjs/config';
import { queryPythonAi, queryPythonAiBatch } from './python-ai.adapter';
import type { FastifyRequest } from 'fastify';
import {
  Controller,
  Logger,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Optional,
  HttpException,
  Req,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OllamaClient } from './ollama.client';
import { LlmOnlySystem } from './llm-only.system';
import { VectorRagSystem } from './vector-rag.system';
import { PostgresService } from '../database/postgres.service';
import { AiBatchQueryRequest, type AiHealthResponse, type AiBatchQueryResponse, type AiQueryRequest, type AiQueryResponse } from './ai.dto';
import { MultiAgentSystem } from './agents/multi-agent.system';
import type { MultiAgentResponse } from './agents/agent.types';
import type { AgentContext } from './agents/agent.types';
import { ResearchRunsService } from '../research/research-runs.service';
import { LiveChainQuery, asksLiveChain } from './live-chain-query';

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly ollama: OllamaClient,
    private readonly llmOnly: LlmOnlySystem,
    private readonly vectorRag: VectorRagSystem,
    private readonly postgres: PostgresService,
    private readonly runs: ResearchRunsService,
    private readonly config: ConfigService,
    @Optional() private readonly multiAgent?: MultiAgentSystem,
    @Optional() private readonly liveChain?: LiveChainQuery,
  ) {}

  @Get('health')
  async health(): Promise<AiHealthResponse> {
    const pythonOrigin = this.config.get<string>('AI_SERVER_URL');
    if (pythonOrigin) {
      try {
        const response = await fetch(new URL('/health', pythonOrigin), { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error('Python health check failed');
        return await response.json() as AiHealthResponse;
      } catch {
        return { status: 'degraded', postgres: await this.checkPostgres() ? 'ok' : 'error',
          ollama: { status: 'unhealthy', latencyMs: 0, error: 'Python AI server is unavailable.' },
          timestamp: new Date().toISOString() };
      }
    }
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
  async query(@Body() request: AiQueryRequest, @Req() httpRequest?: FastifyRequest): Promise<AiQueryResponse | MultiAgentResponse> {
    this.logger.log(`AI single request received: system=${request.system} proposalId=${request.proposalId ?? 'missing'} question=${JSON.stringify(request.question)}`);
    if (this.config.get<string>('AI_SERVER_URL')) {
      const ip = httpRequest?.ip;
      const origin = httpRequest?.headers.origin;
      if (!ip || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) ||
          (origin && !['http://127.0.0.1:3001', 'http://localhost:3001'].includes(origin)))
        throw new ForbiddenException('Python AI is currently available through local CyberDAO only.');
    }
    const started = performance.now();
    const timeoutMs = analysisTimeoutMs(this.config);
    try {
      return await withRequestBudget(async () => {
        const { response, context } = await withRequestBudget(() => this.analyze(request), timeoutMs);
        this.logger.log(`AI single analysis returned: runId=${'runId' in response ? response.runId : 'unknown'} evidenceCount=${'evidence' in response ? response.evidence.length : 0} answerPresent=${'answer' in response ? Boolean(response.answer) : false}`);
        checkRequestBudget();
        const persistenceStarted = performance.now();
        await this.runs.record(request, context, response);
        checkRequestBudget();
        return { ...response, timings: { analysisMs: persistenceStarted - started, persistenceMs: performance.now() - persistenceStarted, serverTotalMs: performance.now() - started } };
      }, timeoutMs + AI_PERSISTENCE_GRACE_MS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return { runId: '', system: request.system, answer: '', evidence: [], retrieval: [], latencyMs: performance.now() - started,
        error: 'Analysis could not complete within the response budget. Please retry or narrow the question.' };
    }
  }

  @Post('query/batch')
  @HttpCode(HttpStatus.OK)
  async batchQuery(@Body() request: AiBatchQueryRequest, @Req() httpRequest?: FastifyRequest): Promise<AiBatchQueryResponse> {
    this.logger.log(`AI batch request received: system=${request.system} proposalId=${request.proposalId} questions=${JSON.stringify(request.questions)}`);
    const origin = this.config.get<string>('AI_SERVER_URL');
    if (!origin) throw new ServiceUnavailableException('Python AI batch service is not configured.');
    const ip = httpRequest?.ip;
    const browserOrigin = httpRequest?.headers.origin;
    if (!ip || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) ||
        (browserOrigin && !['http://127.0.0.1:3001', 'http://localhost:3001'].includes(browserOrigin)))
      throw new ForbiddenException('Python AI is currently available through local CyberDAO only.');
    const proposal = await this.findProposal(request.proposalId);
    if (!proposal) throw new NotFoundException('Selected proposal was not found.');
    const result = await queryPythonAiBatch({ ...request, daoId: proposal.dao_id, proposalId: proposal.id,
      topK: request.topK ?? 4 }, origin, this.config.get<string>('AI_SERVER_TOKEN', ''),
      AbortSignal.any([AbortSignal.timeout(600_000), ...(requestSignal() ? [requestSignal()!] : [])]));
    this.logger.log(`AI batch response received: batchId=${result.batchId} status=${result.status} questions=${result.results.length} tools=${result.toolTraces.map((tool) => String(tool.tool ?? 'unknown')).join(',')} sourceCount=${result.evidence.length} errors=${result.errors.length + result.toolErrors.length}`);
    return result;
  }

  private async analyze(request: AiQueryRequest): Promise<{ response: AiQueryResponse | MultiAgentResponse; context?: AgentContext }> {
    const runId = randomUUID();
    const startTime = Date.now();
    let context: AgentContext | undefined;

    const pythonOrigin = this.config.get<string>('AI_SERVER_URL');
    if (pythonOrigin && ['hybrid', 'vector-rag'].includes(request.system)) {
      context = await this.resolveAgentContext(request);
      const response = await queryPythonAi(
        request, pythonOrigin, this.config.get<string>('AI_SERVER_TOKEN', ''),
        AbortSignal.any([AbortSignal.timeout(180_000), ...(requestSignal() ? [requestSignal()!] : [])]),
      );
      return { response, context };
    }

    if (asksLiveChain(request.question)) {
      context = await this.resolveAgentContext(request);
      if (!this.liveChain) throw new Error('Live CyberChain tool is unavailable.');
      return { response: await this.liveChain.answer(request, context), context };
    }

    try {
      if (request.system === 'multi-agent' || request.system === 'hybrid' || request.system === 'hybrid-verified') {
        if (!this.multiAgent) throw new Error('Multi-agent system is unavailable.');
        context = await this.resolveAgentContext(request);
        checkRequestBudget();
        const result = request.system === 'multi-agent'
          ? await this.multiAgent.execute(context)
          : await this.multiAgent.executeHybrid(context, request.system === 'hybrid-verified');
        return { response: result, context };
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
        return { response };
      }

      if (request.system === 'vector-rag') {
        context = await this.resolveAgentContext(request);
        checkRequestBudget();
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
        return { response, context };
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
      checkRequestBudget();
      return { response, context };
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
      daoId: proposal?.dao_id,
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
      .select(['id', 'dao_id', 'on_chain_id', 'chain_id', 'contract_address']);
    query = /^\d+$/.test(id)
      ? query.where((eb) => eb.or([eb('id', '=', id), eb('on_chain_id', '=', id)]))
      : query.where('id', '=', id);
    return query.executeTakeFirst();
  }

}
