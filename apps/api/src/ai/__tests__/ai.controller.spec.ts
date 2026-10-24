import { ConfigService } from '@nestjs/config';
import { AiController } from '../ai.controller';
import { AiBatchQueryRequest, AiQueryRequest } from '../ai.dto';

describe('AiController', () => {
  const originalFetch = global.fetch;
  const proposal = {
    id: 'prop-1',
    dao_id: 'dao-1',
    on_chain_id: '12',
    chain_id: '1212',
    contract_address: '0x51b43885899bd0301c2beea89addc9d876145d21',
  };
  const database = {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirst: jest.fn().mockResolvedValue(proposal),
  };
  const runs = { record: jest.fn().mockResolvedValue(undefined) };
  const config = new ConfigService({
    AI_SERVER_URL: 'http://127.0.0.1:8001',
    AI_SERVER_TOKEN: 'server-token-that-is-long-enough',
  });
  const controller = new AiController({ database } as any, runs as any, config);
  const httpRequest = { ip: '127.0.0.1', headers: { origin: 'http://localhost:3001' } } as any;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('keeps both request DTOs as runtime metadata for Nest validation', () => {
    expect(Reflect.getMetadata('design:paramtypes', AiController.prototype, 'query')?.[0]).toBe(AiQueryRequest);
    expect(Reflect.getMetadata('design:paramtypes', AiController.prototype, 'batchQuery')?.[0]).toBe(AiBatchQueryRequest);
  });

  it('forwards health to api-ai-server', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
    expect(global.fetch).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:8001/health'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('scopes a single request from PostgreSQL and records the response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      runId: 'run-1', system: 'hybrid', answer: 'Answer', evidence: [], latencyMs: 10,
    }) });
    const request = Object.assign(new AiQueryRequest(), {
      question: 'Summarize this proposal.', proposalId: '12', system: 'hybrid' as const,
    });

    const result = await controller.query(request, httpRequest);

    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sent).toMatchObject({ daoId: 'dao-1', proposalId: 'prop-1', topK: 4 });
    expect(runs.record).toHaveBeenCalledWith(request, expect.objectContaining({
      localProposalId: 'prop-1', onChainProposalId: '12',
    }), expect.objectContaining({ runId: 'run-1' }));
    expect(result).toMatchObject({ runId: 'run-1', system: 'hybrid' });
  });

  it('forwards a scoped batch request', async () => {
    global.fetch = jest.fn().mockImplementation(async (_url, init) => {
      const sent = JSON.parse(init.body as string);
      return { ok: true, json: async () => ({
        batchId: 'batch-1', system: sent.system, status: 'completed',
        scope: { dao_id: sent.daoId, proposal_id: sent.proposalId },
        results: sent.questions.map((question: string) => ({
          questionId: 'q1', question, answer: 'Answer', citations: [], evidence: [], errors: [], metrics: {},
        })),
        evidence: [], errors: [], toolErrors: [], toolTraces: [], metrics: {},
      }) };
    });
    const request = Object.assign(new AiBatchQueryRequest(), {
      proposalId: 'prop-1', system: 'vector-rag' as const, questions: ['What evidence exists?'],
    });

    const result = await controller.batchQuery(request, httpRequest);

    expect(result.batchId).toBe('batch-1');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
      daoId: 'dao-1', proposalId: 'prop-1', topK: 4,
    });
  });
});
