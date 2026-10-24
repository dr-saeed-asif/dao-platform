import {
  BadGatewayException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  ParseUUIDPipe,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PostgresService } from '../database/postgres.service';
import { AssistantAuthService } from './assistant-auth.service';
import { BlockchainVerificationService } from './blockchain-verification.service';
import {
  AssistantAskDto,
  AssistantConversationDto,
  WalletChallengeDto,
  WalletLoginDto,
} from './assistant.dto';

@Controller('ai/assistant')
export class AssistantController {
  constructor(
    private readonly postgres: PostgresService,
    private readonly config: ConfigService,
    private readonly auth: AssistantAuthService,
    @Optional() private readonly blockchain?: BlockchainVerificationService,
  ) {}

  @Post('auth/challenge')
  @HttpCode(200)
  challenge(@Body() body: WalletChallengeDto) {
    return this.auth.challenge(body.address, body.kind);
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: WalletLoginDto) {
    return this.auth.login(body.nonce, body.signature, body.signedTransaction);
  }

  @Post('ask')
  @HttpCode(200)
  async ask(@Body() body: AssistantAskDto, @Req() req: FastifyRequest) {
    const user = this.auth.user(req);
    const proposal = await this.scope(body.proposalId, user);
    if (body.conversation_id)
      await this.conversation(body.conversation_id, proposal, user);
    return (
      await this.upstream(
        '/rag/agents/ask',
        user,
        'POST',
        this.askBody(body, proposal),
      )
    ).json();
  }

  @Post('ask/stream')
  async stream(
    @Body() body: AssistantAskDto,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const user = this.auth.user(req);
    const proposal = await this.scope(body.proposalId, user);
    if (body.conversation_id)
      await this.conversation(body.conversation_id, proposal, user);
    const abort = new AbortController();
    const closed = () => abort.abort();
    reply.raw.once('close', closed);
    try {
      const response = await this.upstream(
        '/rag/agents/ask/stream',
        user,
        'POST',
        this.askBody(body, proposal),
        abort.signal,
      );
      if (
        !response.body ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      )
        throw new BadGatewayException(
          'AI server returned an invalid event stream.',
        );
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      await pipeline(Readable.fromWeb(response.body as never), reply.raw);
    } catch (error) {
      if (!reply.sent) throw error;
      reply.raw.destroy();
    } finally {
      reply.raw.off('close', closed);
    }
  }

  @Post('conversations')
  @HttpCode(200)
  async create(
    @Body() body: AssistantConversationDto,
    @Req() req: FastifyRequest,
  ) {
    const user = this.auth.user(req),
      proposal = await this.scope(body.proposalId, user);
    return (
      await this.upstream('/rag/conversations', user, 'POST', {
        dao_id: proposal.dao_id,
        proposal_id: proposal.id,
        title: body.title,
      })
    ).json();
  }

  @Get('conversations')
  async list(@Query('proposalId') id: string, @Req() req: FastifyRequest) {
    const user = this.auth.user(req),
      proposal = await this.scope(id, user);
    const query = new URLSearchParams({
      dao_id: proposal.dao_id,
      proposal_id: proposal.id,
      limit: '100',
    });
    return (await this.upstream(`/rag/conversations?${query}`, user)).json();
  }

  @Get('conversations/:id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('proposalId') proposalId: string,
    @Req() req: FastifyRequest,
  ) {
    const user = this.auth.user(req),
      proposal = await this.scope(proposalId, user);
    return this.conversation(id, proposal, user);
  }

  @Get('conversations/:id/messages')
  async messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('proposalId') proposalId: string,
    @Req() req: FastifyRequest,
  ) {
    const user = this.auth.user(req),
      proposal = await this.scope(proposalId, user);
    await this.conversation(id, proposal, user);
    return (
      await this.upstream(
        `/rag/conversations/${encodeURIComponent(id)}/messages?limit=100`,
        user,
      )
    ).json();
  }

  @Get('proposals/:id/documents')
  async documents(@Param('id') id: string, @Req() req: FastifyRequest) {
    const user = this.auth.user(req),
      proposal = await this.scope(id, user);
    return (
      await this.upstream(
        `/rag/proposals/${encodeURIComponent(proposal.id)}/documents?dao_id=${encodeURIComponent(proposal.dao_id)}`,
        user,
      )
    ).json();
  }

  @Get('proposals/:id/verification')
  async verify(@Param('id') id: string, @Req() req: FastifyRequest) {
    const user = this.auth.user(req),
      proposal = await this.scope(id, user);
    if (!this.blockchain)
      throw new ServiceUnavailableException(
        'Blockchain verification is unavailable.',
      );
    return this.blockchain.verify(proposal.id, proposal.dao_id);
  }

  @Get('runs')
  async executions(
    @Query('proposalId') id: string,
    @Req() req: FastifyRequest,
  ) {
    const user = this.auth.user(req),
      proposal = await this.scope(id, user);
    const query = new URLSearchParams({
      dao_id: proposal.dao_id,
      proposal_id: proposal.id,
      limit: '500',
    });
    return (await this.upstream(`/rag/agents/runs?${query}`, user)).json();
  }

  @Get('runs/:id')
  async execution(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('proposalId') proposalId: string,
    @Req() req: FastifyRequest,
  ) {
    const user = this.auth.user(req),
      proposal = await this.scope(proposalId, user);
    const query = new URLSearchParams({
      dao_id: proposal.dao_id,
      proposal_id: proposal.id,
    });
    return (
      await this.upstream(`/rag/agents/runs/${id}?${query}`, user)
    ).json();
  }

  private askBody(
    body: AssistantAskDto,
    proposal: { id: string; dao_id: string },
  ) {
    return {
      question: body.question,
      dao_id: proposal.dao_id,
      proposal_id: proposal.id,
      top_k: body.top_k ?? 4,
      concurrency: 1,
      conversation_id: body.conversation_id ?? null,
      title: body.title ?? 'Proposal AI Assistant',
    };
  }

  private async scope(id: string, user: string) {
    if (!id || id.length > 120)
      throw new NotFoundException('Select an existing proposal.');
    const proposal = await this.postgres.database
      .selectFrom('proposals')
      .select(['id', 'dao_id', 'creator_address'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!proposal)
      throw new NotFoundException('The selected proposal no longer exists.');
    const admin = this.config.get<string>('DAO_ADMIN_ADDRESS')?.toLowerCase();
    if (user !== admin && user !== proposal.creator_address?.toLowerCase()) {
      const member = await this.postgres.database
        .selectFrom('proposal_assignments')
        .select('proposal_id')
        .where('proposal_id', '=', proposal.id)
        .where('member_address', '=', user)
        .where('assigned', '=', true)
        .executeTakeFirst();
      if (!member)
        throw new ForbiddenException(
          'Your wallet is not authorized for this proposal.',
        );
    }
    return proposal;
  }

  private async conversation(
    id: string,
    proposal: { id: string; dao_id: string },
    user: string,
  ) {
    const value = await (
      await this.upstream(`/rag/conversations/${encodeURIComponent(id)}`, user)
    ).json();
    if (value.dao_id !== proposal.dao_id || value.proposal_id !== proposal.id)
      throw new ForbiddenException('Conversation belongs to another proposal.');
    return value;
  }

  private async upstream(
    path: string,
    user: string,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
  ) {
    const origin = this.config.get<string>('AI_SERVER_URL'),
      token = this.config.get<string>('AI_SERVER_TOKEN');
    if (!origin || !token)
      throw new ServiceUnavailableException(
        'AI server connection is not configured.',
      );
    const url = new URL(path, origin);
    if (!['http:', 'https:'].includes(url.protocol))
      throw new ServiceUnavailableException('Invalid AI server URL.');
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.any([
          AbortSignal.timeout(600_000),
          ...(signal ? [signal] : []),
        ]),
        headers: {
          Authorization: `Bearer ${token}`,
          'X-DAO-User': user,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new BadGatewayException(
        'AI server is unavailable or timed out. Please try again.',
      );
    }
    if (!response.ok) {
      const status = response.status;
      const message =
        status === 401
          ? 'AI server credentials need administrator attention.'
          : status === 404
            ? 'Proposal or conversation was not found.'
            : status === 403
              ? 'Access to this conversation was denied.'
              : status === 422 || status === 400
                ? 'AI server rejected the questions or proposal scope.'
                : 'AI server failed. Check Ollama availability and configured models, then try again.';
      await response.body?.cancel();
      throw new HttpException(
        message,
        [400, 403, 404, 422].includes(status) ? status : 502,
      );
    }
    return response;
  }
}
