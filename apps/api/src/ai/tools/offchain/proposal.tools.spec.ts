import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { configureApp } from '../../../configure-app';
import { GovernanceToolsService } from '../../agents/governance-tools.service';
import type { PostgresService } from '../../../database/postgres.service';
import type { VectorSearchService } from '../../vector-search.service';
import { ToolRegistry } from '../tool-registry';
import { ToolRegistry as LegacyRegistry } from '../../agents/tool-registry';
import { ProposalToolsController } from '../proposal-tools.controller';
import { ProposalTools, listProposalsInputSchema } from './proposal.tools';

const result = {
  count: 12,
  proposals: [
    { proposalId: 'local-1', title: 'Review', memberCount: 3, voteCount: 2 },
  ],
  query: { asOf: '2026-10-08T12:00:00.000Z' },
};

describe('listProposals', () => {
  let registry: ToolRegistry;
  let service: { listProposals: jest.Mock };
  beforeEach(() => {
    registry = new ToolRegistry();
    service = { listProposals: jest.fn().mockResolvedValue(result) };
    new ProposalTools(
      service as unknown as ProposalQueryService,
      registry,
    ).onModuleInit();
  });

  it('uses one registry for old and new tools, with SQL-only access', async () => {
    expect(LegacyRegistry).toBe(ToolRegistry);
    expect(registry.list('sql').map((tool) => tool.name)).toEqual([
      'listProposals',
    ]);
    expect(registry.list('rag')).toEqual([]);
    await expect(
      registry.invoke('rag', 'listProposals', {}),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    expect(service.listProposals).not.toHaveBeenCalled();
  });

  it('defaults filters, preserves the database count, and emits metadata only', async () => {
    const output = await registry.invoke(
      'sql',
      'listProposals',
      {},
      { daoId: 'trusted-dao' },
    );
    expect(service.listProposals).toHaveBeenCalledWith(
      { status: null, from: null, to: null, limit: 20, offset: 0 },
      'trusted-dao',
    );
    expect(output.result).toEqual({
      ...result,
      evidenceIds: ['structured:proposal:local-1'],
    });
    expect(output.call).toEqual({
      tool: 'listProposals',
      status: 'success',
      latencyMs: expect.any(Number),
      evidenceIds: ['structured:proposal:local-1'],
    });
  });

  it.each([
    null,
    [],
    'ACTIVE',
    { status: 'active' },
    { status: 'INVALID' },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: '20' },
    { offset: -1 },
    { offset: 0.5 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
    { from: 'yesterday' },
    { from: '2026-10-08' },
    { from: '2026-10-08T00:00:00' },
    { from: '2026-10-10T00:00:00Z', to: '2026-10-08T00:00:00Z' },
    { sql: 'select * from proposals' },
    { daoId: 'untrusted-dao' },
  ])('rejects invalid input before querying: %j', async (input) => {
    await expect(
      registry.invoke('sql', 'listProposals', input),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(service.listProposals).not.toHaveBeenCalled();
  });

  it('accepts explicit null filters and equal bounds expressed in different timezones', () => {
    expect(
      listProposalsInputSchema.parse({ status: null, from: null, to: null })
        .limit,
    ).toBe(20);
    expect(
      listProposalsInputSchema.parse({
        from: '2026-10-08T05:00:00+05:00',
        to: '2026-10-08T00:00:00Z',
      }).to,
    ).toBe('2026-10-08T00:00:00Z');
  });

  it('keeps the count for an empty page and fabricates no row evidence', async () => {
    service.listProposals.mockResolvedValue({ ...result, proposals: [] });
    const output = await registry.invoke('sql', 'listProposals', {
      offset: 100,
    });
    expect(output.result).toMatchObject({
      count: 12,
      proposals: [],
      evidenceIds: [],
    });
  });

  it('reports service failure without putting data or exception details in telemetry', async () => {
    service.listProposals.mockRejectedValue(
      new Error('sensitive database detail'),
    );
    await expect(
      registry.invoke('sql', 'listProposals', {}),
    ).rejects.toMatchObject({
      toolCall: {
        tool: 'listProposals',
        status: 'error',
        evidenceIds: [],
        latencyMs: expect.any(Number),
      },
    });
  });

  it('rejects duplicate registration', () => {
    expect(() =>
      new ProposalTools(
        service as unknown as ProposalQueryService,
        registry,
      ).onModuleInit(),
    ).toThrow('already registered');
  });

  it('cancels execution before calling the service', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      registry.invoke(
        'sql',
        'listProposals',
        {},
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(service.listProposals).not.toHaveBeenCalled();
  });

  it('enforces the execution deadline', async () => {
    jest.useFakeTimers();
    try {
      service.listProposals.mockImplementation(() => new Promise(() => {}));
      const assertion = expect(
        registry.invoke('sql', 'listProposals', {}),
      ).rejects.toMatchObject({ code: 'TIMEOUT' });
      await jest.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('structured proposal evidence resolution', () => {
  it.each([undefined, 'dataset-v1'])(
    'resolves row references and rejects historical dataset claims (%s)',
    async (datasetVersion) => {
      const registry = new ToolRegistry();
      const repository = {
        findStructuredEvidence: jest.fn().mockResolvedValue({
          id: 'local-1',
          chain_id: '1212',
          contract_address: '0xcontract',
          updated_at: new Date(),
          creation_evidence_id: 'event:created',
        }),
      };
      const queries = new ProposalQueryService(
        repository as unknown as ConstructorParameters<
          typeof ProposalQueryService
        >[0],
      );
      new GovernanceToolsService(
        {} as PostgresService,
        {} as VectorSearchService,
        registry,
        queries,
      ).onModuleInit();
      const output = await registry.invoke('provenance', 'getEvidenceById', {
        evidenceId: 'structured:proposal:local-1',
        datasetVersion,
      });
      expect(repository.findStructuredEvidence).toHaveBeenCalledWith('local-1');
      expect(output.result).toMatchObject({
        valid: !datasetVersion,
        proposalId: 'local-1',
        relatedEvidence: ['event:created'],
      });
    },
  );

  it('marks absent proposal references invalid', async () => {
    const repository = {
      findStructuredEvidence: jest.fn().mockResolvedValue(undefined),
    };
    const queries = new ProposalQueryService(
      repository as unknown as ConstructorParameters<
        typeof ProposalQueryService
      >[0],
    );
    await expect(
      queries.resolveEvidence('structured:proposal:missing'),
    ).resolves.toMatchObject({
      valid: false,
      proposalId: null,
      relatedEvidence: [],
    });
  });
});

describe('POST /v1/ai/tools/list-proposals', () => {
  let app: NestFastifyApplication;
  const service = { listProposals: jest.fn().mockResolvedValue(result) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProposalToolsController],
      providers: [
        ToolRegistry,
        ProposalTools,
        { provide: ProposalQueryService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('works without an LLM or MCP provider', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/tools/list-proposals',
      payload: { status: 'ACTIVE' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      count: 12,
      evidenceIds: ['structured:proposal:local-1'],
    });
  });

  it('returns 400 for invalid filters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/tools/list-proposals',
      payload: { limit: -1 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('does not expose database errors over HTTP', async () => {
    service.listProposals.mockRejectedValueOnce(
      new Error('private connection details'),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/tools/list-proposals',
      payload: {},
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private connection');
  });
});
