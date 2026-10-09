import { ConfigService } from '@nestjs/config';
import { MultiAgentSystem } from '../agents/multi-agent.system';
import { QueryOrchestrator } from '../orchestration/query-orchestrator';
import { QueryRouter, isProposalListQuestion } from '../router/query-router';
import { SynthesisService } from '../synthesis/synthesis.service';
import {
  ProposalTools,
  type ListProposalsOutput,
} from '../tools/offchain/proposal.tools';
import { ToolRegistry } from '../tools/tool-registry';
import { OllamaClient } from '../ollama.client';
import { ProposalQueryService } from '../../proposals/proposal-query.service';

const activePlan = {
  tool: 'listProposals',
  input: { status: 'ACTIVE', limit: 1 },
  answerMode: 'count',
};
const listing: ListProposalsOutput = {
  count: 2,
  proposals: [
    {
      proposalId: 'local-1',
      onChainProposalId: '8',
      title: 'Treasury Review',
      creator: '0xcreator',
      status: 'ACTIVE',
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-10-20T00:00:00Z',
      memberCount: 4,
      voteCount: 2,
    },
  ],
  evidenceIds: ['structured:proposal:local-1'],
  query: {
    status: 'ACTIVE',
    from: null,
    to: null,
    limit: 1,
    offset: 0,
    asOf: '2026-10-08T12:00:00Z',
    chainId: '1212',
    contractAddress: '0xcontract',
    daoId: null,
  },
};

function setup(
  plan: unknown = activePlan,
  data: ListProposalsOutput = listing,
  configValues: Record<string, unknown> = {},
) {
  const config = new ConfigService({ MCP_ENABLED: false, ...configValues });
  const registry = new ToolRegistry();
  const service = { listProposals: jest.fn().mockResolvedValue(data) };
  new ProposalTools(
    service as unknown as ProposalQueryService,
    registry,
  ).onModuleInit();
  const chat = jest.fn(async (messages: Array<{ content: string }>) => {
    const user = messages[1]!.content;
    let content: string;
    if (user.startsWith('{')) {
      const payload = JSON.parse(user) as { statements: Array<{ id: string }> };
      content = JSON.stringify({
        statementIds: payload.statements.map((item) => item.id),
      });
    } else content = JSON.stringify(plan);
    return { content, latencyMs: 1, inputTokens: 5, outputTokens: 5 };
  });
  const ollama = {
    chat,
    getChatModel: () => 'test-model',
  } as unknown as OllamaClient;
  const workflow = new QueryOrchestrator(
    new QueryRouter(ollama, registry),
    registry,
    new SynthesisService(ollama),
    ollama,
    config,
  );
  const system = new MultiAgentSystem(registry, ollama, config, workflow);
  return { system, workflow, service, chat };
}

describe('Proposal-list workflow', () => {
  it.each(['multi-agent', 'hybrid', 'hybrid-verified'] as const)(
    'runs through %s with MCP disabled and no selected proposal',
    async (mode) => {
      const { system, service, chat } = setup();
      const input = { question: 'How many proposals are active now?' };
      const output =
        mode === 'multi-agent'
          ? await system.execute(input)
          : await system.executeHybrid(input, mode === 'hybrid-verified');
      expect(output.abstained).toBe(false);
      expect(output.answer).toContain('2 active proposals');
      expect(output.llmCalls).toBe(0);
      expect(chat).not.toHaveBeenCalled();
      expect(output.toolsUsed).toEqual(['listProposals']);
      expect(output.embeddingCalls).toBe(0);
      expect(service.listProposals).toHaveBeenCalledWith(
        { status: 'ACTIVE', from: null, to: null, limit: 20, offset: 0 },
        undefined,
      );
      expect(output.claims[0]?.evidenceIds).toEqual([
        `structured:listProposals:${output.runId}`,
      ]);
      expect(output.evidence[0]?.data).toMatchObject({
        count: 2,
        sourceTool: 'listProposals',
        kind: 'query-result',
      });
      if (mode === 'hybrid') expect(output.verification).toBeUndefined();
      else expect(output.verification?.status).toBe('SUPPORTED');
    },
  );

  it('lists rows and explicitly reports a partial page without counting it as the total', async () => {
    const { system } = setup({ ...activePlan, answerMode: 'list' });
    const output = await system.execute({ question: 'Show active proposals' });
    expect(output.answer).toContain('Treasury Review');
    expect(output.answer).toContain('Showing matches 1–1 of 2');
    expect(output.answer).toContain('[structured:proposal:local-1]');
  });

  it('answers zero results with real query-result evidence rather than invented proposal IDs', async () => {
    const { system } = setup(activePlan, {
      ...listing,
      count: 0,
      proposals: [],
      evidenceIds: [],
    });
    const output = await system.execute({
      question: 'How many proposals are active now?',
    });
    expect(output.abstained).toBe(false);
    expect(output.answer).toContain('0 active proposals');
    expect(output.evidence).toHaveLength(1);
    expect(output.evidence[0]?.evidenceId).toBe(
      `structured:listProposals:${output.runId}`,
    );
  });

  it('passes trusted DAO scope separately from LLM arguments', async () => {
    const { system, service } = setup();
    await system.execute({
      question: 'How many proposals are active?',
      daoId: 'trusted-dao',
    });
    expect(service.listProposals).toHaveBeenCalledWith(
      expect.anything(),
      'trusted-dao',
    );
  });

  it.each([
    { ...activePlan, tool: 'rawSql' },
    { ...activePlan, input: { status: 'ACTIVE', daoId: 'untrusted-dao' } },
    { ...activePlan, input: { status: 'FINALIZED' } },
    { ...activePlan, input: { status: 'ACTIVE', limit: 1000 } },
  ])(
    'rejects invalid or contradictory plans before tool execution',
    async (plan) => {
      const { system, service } = setup(plan);
      const output = await system.execute({
        question: 'How many active proposals start voting after 2026-10-01T00:00:00Z?',
      });
      expect(output.abstained).toBe(true);
      expect(service.listProposals).not.toHaveBeenCalled();
      expect(output.llmCalls).toBe(1);
    },
  );

  it('asks for a supported request when the LLM cannot express its filters', async () => {
    const { system, service } = setup({
      tool: null,
      input: {},
      answerMode: 'list',
    });
    const output = await system.execute({
      question: 'Show proposals created by wallet X',
    });
    expect(output.answer).toContain('one status');
    expect(output.abstained).toBe(true);
    expect(service.listProposals).not.toHaveBeenCalled();
  });

  it('rejects unsupported answer statements and free-form additions', async () => {
    const { system, chat } = setup();
    chat.mockResolvedValueOnce({
      content: JSON.stringify(activePlan),
      latencyMs: 1,
      inputTokens: 0,
      outputTokens: 0,
    });
    chat.mockResolvedValueOnce({
      content:
        '{"statementIds":["total","invented-proof"],"answer":"99 active proposals"}',
      latencyMs: 1,
      inputTokens: 0,
      outputTokens: 0,
    });
    const output = await system.execute({
      question: 'How many proposals are active?',
    });
    expect(output.abstained).toBe(false);
    expect(output.answer).toContain('2 active proposals');
    expect(output.claims).toBeTruthy();
    expect(output.claims[0]?.evidenceIds).toEqual([
      `structured:listProposals:${output.runId}`,
    ]);
  });

  it('counts failed LLM attempts and does not expose their error payload', async () => {
    const { system, chat } = setup();
    chat.mockRejectedValueOnce(new Error('private upstream payload'));
    const output = await system.execute({
      question: 'How many active proposals start voting after 2026-10-01T00:00:00Z?',
    });
    expect(output.llmCalls).toBe(1);
    expect(output.abstained).toBe(true);
    expect(JSON.stringify(output)).not.toContain('private upstream');
  });

  it('respects the LLM call budget', async () => {
    const { system, chat } = setup(activePlan, listing, { MAX_LLM_CALLS: 1 });
    const output = await system.execute({
      question: 'How many proposals are active?',
    });
    expect(output.answer).toContain('2 active proposals');
    expect(output.abstained).toBe(false);
  });

  it('does not pretend a live query is a historical dataset snapshot', async () => {
    const { system, service, chat } = setup();
    const output = await system.execute({
      question: 'How many proposals are active?',
      datasetVersion: 'v1',
    });
    expect(output.abstained).toBe(true);
    expect(service.listProposals).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });

  it('preserves single-proposal routing', () => {
    expect(
      isProposalListQuestion('How many votes did proposal 8 receive?'),
    ).toBe(false);
    expect(isProposalListQuestion('Summarize this proposal')).toBe(false);
    expect(isProposalListQuestion('What is the proposal count?')).toBe(true);
  });
});
