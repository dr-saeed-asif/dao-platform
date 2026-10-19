import { LiveChainQuery, asksLiveChain } from '../live-chain-query';
import { ToolRegistry } from '../tools/tool-registry';
import type { AgentContext } from '../agents/agent.types';
import { AiController } from '../ai.controller';
import { ConfigService } from '@nestjs/config';

const context: AgentContext = { question: '', topK: 4, localProposalId: 'local-32', onChainProposalId: '32' };
const snapshot = { source: 'live-cyberchain-rpc', chainId: '1212', contractAddress: '0xcontract', fetchedAt: '2026-10-19T12:00:00Z',
  blockNumber: '12345', blockHash: '0xblock', blockTimestamp: '2026-10-19T11:59:59Z', proposalCount: '34', owner: '0xowner',
  events: [], evidenceIds: ['rpc:snapshot'], proposal: { id: '32', state: 'CLOSED', voteCount: 3, assignedMemberCount: 4,
    startsAt: '2026-10-18T12:00:00Z', endsAt: '2026-10-18T14:00:00Z', finalized: false, optionVotes: ['2','1'] } };

describe('live blockchain question workflow', () => {
  it.each(['cross check with the blockchain', 'can you see what we have on the blockchain',
    'answer me from the onchain', 'answer from the blockchian', 'fetch fresh CyberChain votes', 'verify against RPC'])('routes %s to a fresh tool', q => {
    expect(asksLiveChain(q)).toBe(true);
  });

  it('does not take over PDF or ordinary database questions', () => {
    expect(asksLiveChain('Summarize this PDF')).toBe(false);
    expect(asksLiveChain('How many proposals we have?')).toBe(false);
  });

  it('uses live facts and blockchain evidence in the frontend answer', async () => {
    const invoke = jest.fn().mockResolvedValue({ result: snapshot, call: { tool: 'fetchLiveCyberChain', latencyMs: 3 } });
    const service = new LiveChainQuery({ invoke } as unknown as ToolRegistry, {} as any);
    const answer = await service.answer({ question: 'Answer the votes from onchain', proposalId: 'local-32', system: 'hybrid' }, context);
    expect(invoke).toHaveBeenCalledWith('provenance', 'fetchLiveCyberChain', { onChainProposalId: '32', includeEvents: false });
    expect(answer.answer).toContain('3 votes');
    expect(answer.answer).toContain('block 12345');
    expect(answer.evidence[0]).toMatchObject({ sourceType: 'ON_CHAIN_RPC' });
    expect(answer.abstained).toBe(false);
    expect(answer.llmCalls).toBe(0);
  });

  it('counts the entire deployed contract even when a proposal is selected', async () => {
    const invoke = jest.fn().mockResolvedValue({ result: { ...snapshot, proposal: undefined }, call: {} });
    const service = new LiveChainQuery({ invoke } as any, {} as any);
    const answer = await service.answer({ question: 'How many proposals are on the blockchain?', system: 'hybrid' }, context);
    expect(invoke.mock.calls[0][2]).not.toHaveProperty('onChainProposalId');
    expect(answer.answer).toContain('34 on-chain proposals');
  });

  it('does not attach a selected proposal from another deployment to live facts', async () => {
    const service = new LiveChainQuery({ invoke: jest.fn().mockResolvedValue({ result: snapshot, call: {} }) } as any, {} as any);
    const answer = await service.answer({ question: 'check blockchain', system: 'hybrid' }, { ...context, chainId: '1' });
    expect(answer.abstained).toBe(true);
    expect(answer.evidence).toEqual([]);
    expect(answer.errors[0]).toContain('different chain');
  });

  it('never substitutes indexed facts after a failed live call', async () => {
    const service = new LiveChainQuery({ invoke: jest.fn().mockRejectedValue(new Error('RPC unavailable')) } as any, {} as any);
    const answer = await service.answer({ question: 'check blockchain', system: 'hybrid' }, context);
    expect(answer.abstained).toBe(true);
    expect(answer.answer).toContain('No cached blockchain answer');
    expect(answer.evidence).toEqual([]);
    expect(answer.errors).toEqual(['RPC unavailable']);
  });

  it('rejects a selected draft and conflicting proposal scope before fetching RPC', async () => {
    const invoke = jest.fn();
    const service = new LiveChainQuery({ invoke } as any, {} as any);
    const request = { question: 'check blockchain', system: 'hybrid' as const };
    const draft = await service.answer(request, { ...context, onChainProposalId: undefined });
    expect(draft.answer).toContain('no on-chain ID');
    const conflict = await service.answer(request, { ...context, scopeConflict: 'Choose proposal #32 or #33.' });
    expect(conflict.answer).toContain('Choose proposal');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports a real database mismatch and cites both sources', async () => {
    const invoke = jest.fn().mockResolvedValue({ result: snapshot, call: {} });
    const record = { metadata_hash: null, starts_at: snapshot.proposal.startsAt, ends_at: snapshot.proposal.endsAt };
    const database = { selectFrom: jest.fn((table: string) => {
      const query: any = { select: jest.fn(() => query), where: jest.fn(() => query),
        executeTakeFirst: jest.fn().mockResolvedValue(record),
        executeTakeFirstOrThrow: jest.fn().mockResolvedValue({ total: table === 'votes' ? '3' : '5' }) };
      return query;
    }) };
    const service = new LiveChainQuery({ invoke } as any, { database } as any);
    const answer = await service.answer({ question: 'cross check with the blockchain', system: 'hybrid' }, context);
    expect(answer.answer).toContain('assigned members: DIFFERENT (stored 5; live 4)');
    expect(answer.answer).toContain('vote records: MATCH');
    expect(answer.evidence[answer.evidence.length - 1]).toMatchObject({ sourceType: 'STRUCTURED_DB' });
    expect(answer.answer).toContain('[C1][DB1]');
  });

  it('keeps the fresh answer when only the database comparison fails', async () => {
    const service = new LiveChainQuery({ invoke: jest.fn().mockResolvedValue({ result: snapshot, call: {} }) } as any, {} as any);
    const answer = await service.answer({ question: 'cross check blockchain', system: 'hybrid' }, context);
    expect(answer.answer).toContain('No match is claimed');
    expect(answer.abstained).toBe(false);
    expect(answer.evidence).toHaveLength(1);
  });

  it('routes frontend requests to the new tool even with Python AI enabled', async () => {
    const live = { answer: jest.fn().mockResolvedValue({ runId: 'live-run', system: 'hybrid', answer: 'live facts', evidence: [], latencyMs: 1 }) };
    const runs = { record: jest.fn().mockResolvedValue(undefined) };
    const select: any = { select: jest.fn(() => select), where: jest.fn(() => select),
      executeTakeFirst: jest.fn().mockResolvedValue({ id: 'local-32', on_chain_id: '32', dao_id: 'dao-A' }) };
    const controller = new AiController({} as any, {} as any, {} as any, { database: { selectFrom: () => select } } as any,
      runs as any, new ConfigService({ AI_SERVER_URL: 'http://127.0.0.1:8001' }), undefined, live as any);
    const answer = await controller.query({ question: 'answer me from onchain', proposalId: 'local-32', system: 'hybrid' },
      { ip: '127.0.0.1', headers: {} } as any);
    expect(answer.answer).toBe('live facts');
    expect(live.answer).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ onChainProposalId: '32' }));
    expect(runs.record).toHaveBeenCalled();
  });
});
