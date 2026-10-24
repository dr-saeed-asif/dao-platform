import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { PostgresService } from '../database/postgres.service';
import { ResearchRunsService } from '../research/research-runs.service';
import {
  AiBatchQueryRequest,
  AiQueryRequest,
  type AiBatchQueryResponse,
  type AiHealthResponse,
  type AiQueryResponse,
} from './ai.dto';
import { queryPythonAi, queryPythonAiBatch, queryPythonAiHealth } from './python-ai.adapter';
import { RetiredAiGuard } from './retired-ai.guard';

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:3001', 'http://localhost:3001']);

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly postgres: PostgresService,
    private readonly runs: ResearchRunsService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  health(): Promise<AiHealthResponse> {
    const { origin, token } = this.connection();
    return queryPythonAiHealth(origin, token, AbortSignal.timeout(10_000));
  }

  @Post('query')
  @UseGuards(RetiredAiGuard)
  @HttpCode(HttpStatus.OK)
  async query(
    @Body() request: AiQueryRequest,
    @Req() httpRequest?: FastifyRequest,
  ): Promise<AiQueryResponse> {
    this.assertLocalCaller(httpRequest);
    const proposal = await this.findProposal(request.proposalId);
    if (!proposal) throw new NotFoundException('Selected proposal was not found.');

    const { origin, token } = this.connection();
    const started = performance.now();
    const upstreamRequest = {
      ...request,
      daoId: proposal.dao_id,
      proposalId: proposal.id,
      topK: request.topK ?? 4,
    };
    const response = await queryPythonAi(
      upstreamRequest,
      origin,
      token,
      AbortSignal.timeout(180_000),
    );
    const persistenceStarted = performance.now();
    await this.runs.record(request, {
      localProposalId: proposal.id,
      onChainProposalId: proposal.on_chain_id ?? undefined,
      chainId: proposal.chain_id,
      contractAddress: proposal.contract_address,
    }, response);
    this.logger.log(`AI response received: runId=${response.runId} system=${response.system}`);
    return {
      ...response,
      timings: {
        upstreamMs: persistenceStarted - started,
        persistenceMs: performance.now() - persistenceStarted,
        serverTotalMs: performance.now() - started,
      },
    };
  }

  @Post('query/batch')
  @UseGuards(RetiredAiGuard)
  @HttpCode(HttpStatus.OK)
  async batchQuery(
    @Body() request: AiBatchQueryRequest,
    @Req() httpRequest?: FastifyRequest,
  ): Promise<AiBatchQueryResponse> {
    this.assertLocalCaller(httpRequest);
    const proposal = await this.findProposal(request.proposalId);
    if (!proposal) throw new NotFoundException('Selected proposal was not found.');

    const { origin, token } = this.connection();
    const result = await queryPythonAiBatch({
      ...request,
      daoId: proposal.dao_id,
      proposalId: proposal.id,
      topK: request.topK ?? 4,
    }, origin, token, AbortSignal.timeout(600_000));
    this.logger.log(`AI batch response received: batchId=${result.batchId} status=${result.status}`);
    return result;
  }

  private connection(): { origin: string; token: string } {
    const origin = this.config.get<string>('AI_SERVER_URL');
    const token = this.config.get<string>('AI_SERVER_TOKEN');
    if (!origin || !token) {
      throw new ServiceUnavailableException('API AI server connection is not configured.');
    }
    return { origin, token };
  }

  private assertLocalCaller(request?: FastifyRequest): void {
    const ip = request?.ip;
    const origin = request?.headers.origin;
    if (!ip || !LOCAL_ADDRESSES.has(ip) || (origin && !LOCAL_ORIGINS.has(origin))) {
      throw new ForbiddenException('AI is currently available through local CyberDAO only.');
    }
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
