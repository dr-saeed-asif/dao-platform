import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Interface, type JsonFragment } from 'ethers';
import {
  CYBER_DAO_GOVERNANCE_READ_ABI,
  CYBER_DAO_GOVERNANCE_WRITE_ABI,
} from '@dao-platform/blockchain-cyberchain';
import { BlockchainVerificationService } from '../blockchain-verification.service';
import { BlockchainVerificationController } from '../blockchain-verification.controller';

const contract = '0x' + '11'.repeat(20),
  creator = '0x' + '22'.repeat(20),
  hash = '0x' + '33'.repeat(32),
  blockHash = '0x' + '44'.repeat(32),
  metadata = '0x' + '55'.repeat(32);
const abi = new Interface([
  ...(CYBER_DAO_GOVERNANCE_WRITE_ABI as unknown as JsonFragment[]),
  ...CYBER_DAO_GOVERNANCE_READ_ABI,
]);
const p = {
  id: 'p',
  dao_id: 'dao',
  on_chain_id: '28',
  chain_id: '1212',
  contract_address: contract,
  starts_at: new Date(1000 * 1000),
  ends_at: new Date(2000 * 1000),
  status: 'VOTING_CLOSED',
  metadata_hash: metadata,
  metadata_uri: 'ipfs://verified',
  finalized_at: null,
  total_votes: '0',
};
const config = new ConfigService({
  CYBERCHAIN_CHAIN_ID: '1212',
  GOVERNANCE_CONTRACT_ADDRESS: contract,
  GOVERNANCE_DEPLOYMENT_BLOCK: '1',
  AI_SERVER_TOKEN: 'test-operator-token',
});
function fixture(
  overrides: Record<string, unknown> = {},
  hasStoredEvent = true,
  checkpoint: unknown = {
    processed_block_number: '100',
    processed_block_hash: blockHash,
  },
) {
  const encoded = abi.encodeEventLog(abi.getEvent('ProposalCreated')!, [
    '28',
    creator,
    0,
    metadata,
    'ipfs://verified',
    2,
    1000,
    2000,
  ]);
  const args = {
    proposalId: '28',
    creator,
    proposalType: '0',
    metadataHash: metadata,
    metadataURI: 'ipfs://verified',
    optionCount: '2',
    startsAt: '1000',
    endsAt: '2000',
  };
  const stored = {
    event_name: 'ProposalCreated',
    evidence_id: 'e1',
    transaction_hash: hash,
    log_index: '0',
    block_number: '1',
    block_hash: blockHash,
    event_args: args,
  };
  const db = {
    selectFrom: jest.fn((table: string) => {
      const q: any = {
        selectAll: () => q,
        where: jest.fn(() => q),
        executeTakeFirst: async () =>
          table === 'indexer_checkpoints' ? checkpoint : { ...p, ...overrides },
        execute: async () =>
          table === 'votes' ||
          (table === 'governance_events' && !hasStoredEvent)
            ? []
            : [stored],
      };
      return q;
    }),
  };
  const service = new BlockchainVerificationService(
    { database: db } as any,
    config,
  );
  const rpc = jest
    .spyOn(service as any, 'rpc')
    .mockImplementation(async (...a: any[]) => {
      const [method, params] = a;
      if (method === 'eth_chainId') return '0x4bc';
      if (method === 'eth_blockNumber') return '0x64';
      if (method === 'eth_getBlockByNumber')
        return { hash: blockHash, number: '0x64', timestamp: '0xbb8' };
      if (method === 'eth_getLogs')
        return [
          {
            ...encoded,
            transactionHash: hash,
            logIndex: '0x0',
            blockNumber: '0x1',
            blockHash,
          },
        ];
      if (method === 'eth_getTransactionReceipt')
        return { status: '0x1', to: contract, blockNumber: '0x1', blockHash };
      if (method === 'eth_getTransactionByHash')
        return { to: contract, from: creator };
      if (method === 'eth_call') {
        const parsed = abi.parseTransaction({ data: params[0].data })!;
        const values =
          parsed.name === 'getProposal'
            ? [
                [
                  metadata,
                  'ipfs://verified',
                  1000,
                  2000,
                  2,
                  0,
                  1,
                  0,
                  0,
                  false,
                  false,
                  false,
                ],
              ]
            : parsed.name === 'proposalState'
              ? [2]
              : [0];
        return abi.encodeFunctionResult(parsed.name, values);
      }
      throw new Error('Unexpected RPC method ' + method);
    });
  return { service, rpc, db };
}
describe('Read-only blockchain verification', () => {
  it('leaves an unknown SQL status unverified rather than inventing a mismatch', async () => {
    const { service } = fixture({ status: 'UNKNOWN' });
    const result = await service.verify('p');
    expect(
      result.comparisons.find((c) => c.field === 'voting_status'),
    ).toMatchObject({ status: 'unverified', database: 'UNKNOWN' });
    expect(result.status).toBe('unverified');
  });
  it('does not compare missing event totals beyond a lagging checkpoint', async () => {
    const { service } = fixture({}, false, {
      processed_block_number: '0',
      processed_block_hash: null,
    });
    const result = await service.verify('p');
    expect(result.status).toBe('unverified');
    expect(
      result.comparisons.some(
        (c) =>
          c.field === 'governance_events.count' && c.status === 'mismatched',
      ),
    ).toBe(false);
  });

  it.each([
    ['DRAFT', 'unverified'],
    ['PENDING', 'unverified'],
    ['PENDING_ON_CHAIN', 'unverified'],
    ['ACTIVE', 'verified'],
    ['VOTING_OPEN', 'verified'],
    ['VOTING_CLOSED', 'verified'],
    ['CLOSED', 'verified'],
    ['FINALIZED', 'verified'],
    ['CANCELLED', 'verified'],
    ['FAILED', 'unverified'],
    ['EXECUTED', 'unverified'],
    ['toString', 'unverified'],
  ])('handles database status %s explicitly', async (status, expected) => {
    const { service, rpc } = fixture({ status });
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (...args: any[]) => {
      if (
        status === 'CANCELLED' &&
        args[0] === 'eth_call' &&
        abi.parseTransaction({ data: args[1][0].data })?.name ===
          'proposalState'
      )
        return abi.encodeFunctionResult('proposalState', [3]);
      return original(...args);
    });
    expect(
      (await service.verify('p')).comparisons.find(
        (c) => c.field === 'voting_status',
      )?.status,
    ).toBe(expected);
  });
  it.each([
    [999, 0],
    [1000, 1],
    [1999, 1],
    [2000, 2],
  ])('uses pinned clock %s for stored ACTIVE', async (clock, state) => {
    const { service, rpc } = fixture({ status: 'ACTIVE' });
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (...args: any[]) => {
      if (args[0] === 'eth_getBlockByNumber')
        return {
          hash: blockHash,
          number: '0x64',
          timestamp: '0x' + clock.toString(16),
        };
      if (
        args[0] === 'eth_call' &&
        abi.parseTransaction({ data: args[1][0].data })?.name ===
          'proposalState'
      )
        return abi.encodeFunctionResult('proposalState', [state]);
      return original(...args);
    });
    expect(
      (await service.verify('p')).comparisons.find(
        (c) => c.field === 'voting_status',
      )?.status,
    ).toBe('verified');
  });
  it('retains a genuine state mismatch', async () => {
    const { service } = fixture({ status: 'CANCELLED' });
    const result = await service.verify('p');
    expect(result.status).toBe('mismatched');
    expect(
      result.comparisons.find((c) => c.field === 'voting_status')?.status,
    ).toBe('mismatched');
  });
  it.each([
    [null, 'missing'],
    [{ processed_block_number: '99', processed_block_hash: null }, 'lagging'],
    [
      { processed_block_number: '100', processed_block_hash: blockHash },
      'current',
    ],
    [{ processed_block_number: '101', processed_block_hash: null }, 'ahead'],
    [{ processed_block_number: '-1', processed_block_hash: null }, 'invalid'],
    [{ processed_block_number: '1.5', processed_block_hash: null }, 'invalid'],
    [
      { processed_block_number: 'garbage', processed_block_hash: null },
      'invalid',
    ],
    [
      {
        processed_block_number: '100',
        processed_block_hash: '0x' + '99'.repeat(32),
      },
      'invalid',
    ],
  ])('reports checkpoint %j as %s', async (checkpoint, expected) => {
    const { service, db } = fixture({}, true, checkpoint);
    const result = await service.verify('p');
    expect(result.indexer_checkpoint?.status).toBe(expected);
    expect(result.status).toBe(
      expected === 'current' ? 'verified' : 'unverified',
    );
    const query = db.selectFrom.mock.results[1].value;
    expect(query.where).toHaveBeenCalledWith('chain_id', '=', '1212');
    expect(query.where).toHaveBeenCalledWith('contract_address', '=', contract);
    expect(query.where).toHaveBeenCalledWith(
      'indexer_name',
      '=',
      'governance-full',
    );
    expect(query.where).toHaveBeenCalledWith('indexer_version', '=', 'v1');
  });
  it('does not suppress genuine excess SQL assignments when checkpoint lags', async () => {
    const { service, rpc } = fixture({}, true, {
      processed_block_number: '99',
      processed_block_hash: null,
    });
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (...args: any[]) => {
      const response = await original(...args);
      if (
        args[0] !== 'eth_call' ||
        abi.parseTransaction({ data: args[1][0].data })?.name !== 'getProposal'
      )
        return response;
      const data = abi
        .decodeFunctionResult('getProposal', response)[0]
        .toArray();
      data[6] = 0;
      return abi.encodeFunctionResult('getProposal', [data]);
    });
    expect((await service.verify('p')).status).toBe('mismatched');
  });
  it('labels only an exactly event-explained count deficit as indexing lag', async () => {
    const { service, rpc } = fixture({}, true, {
      processed_block_number: '99',
      processed_block_hash: null,
    });
    const original = rpc.getMockImplementation()!;
    const vote = abi.encodeEventLog(abi.getEvent('VoteCast')!, [
      '28',
      creator,
      0,
    ]);
    rpc.mockImplementation(async (...args: any[]) => {
      const response = await original(...args);
      if (args[0] === 'eth_getLogs')
        return [
          ...response,
          {
            ...vote,
            transactionHash: hash,
            logIndex: '0x1',
            blockNumber: '0x64',
            blockHash,
          },
        ];
      if (args[0] !== 'eth_call') return response;
      const name = abi.parseTransaction({ data: args[1][0].data })?.name;
      if (name === 'getProposal') {
        const data = abi.decodeFunctionResult(name, response)[0].toArray();
        data[7] = 1;
        return abi.encodeFunctionResult(name, [data]);
      }
      if (name === 'optionVoteCount')
        return abi.encodeFunctionResult(name, [
          Number(abi.parseTransaction({ data: args[1][0].data })!.args[1]) === 0
            ? 1
            : 0,
        ]);
      return response;
    });
    const result = await service.verify('p');
    expect(result.status).toBe('unverified');
    for (const field of [
      'public.votes.count',
      'public.proposals.total_votes',
      'option_0_vote_count',
    ]) {
      expect(result.comparisons.find((c) => c.field === field)).toMatchObject({
        status: 'unverified',
        reason: expect.stringContaining('Exact count difference'),
      });
    }
  });
  it('marks a missing indexed event mismatched within current checkpoint coverage', async () => {
    const { service } = fixture({}, false);
    expect((await service.verify('p')).status).toBe('mismatched');
  });
  it.each(['timeout', 'missing', 'partial', 'wrong-height', 'checkpoint-rpc'])(
    'handles %s RPC failure without claiming verification',
    async (mode) => {
      const { service, rpc } = fixture(
        {},
        true,
        mode === 'checkpoint-rpc'
          ? { processed_block_number: '99', processed_block_hash: blockHash }
          : undefined,
      );
      const original = rpc.getMockImplementation()!;
      rpc.mockImplementation(async (...args: any[]) => {
        if (mode === 'timeout') throw new Error('RPC timeout');
        if (
          mode === 'checkpoint-rpc' &&
          args[0] === 'eth_getBlockByNumber' &&
          args[1][0] !== '0x64'
        )
          throw new Error('RPC timeout');
        if (mode === 'wrong-height' && args[0] === 'eth_getBlockByNumber')
          return { hash: blockHash, number: '0x63' };
        if (
          args[0] === 'eth_call' &&
          (mode === 'missing' || mode === 'partial')
        )
          return mode === 'missing' ? null : '0x00';
        return original(...args);
      });
      const result = await service.verify('p');
      expect(result.status).toBe(
        mode === 'checkpoint-rpc' ? 'unverified' : 'unavailable',
      );
      if (mode === 'checkpoint-rpc')
        expect(result.indexer_checkpoint?.status).toBe('unavailable');
    },
  );
  it('rejects a reverted transaction receipt as mismatched', async () => {
    const { service, rpc } = fixture();
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (...args: any[]) =>
      args[0] === 'eth_getTransactionReceipt'
        ? { status: '0x0', to: contract, blockNumber: '0x1', blockHash }
        : original(...args),
    );
    const result = await service.verify('p');
    expect(result.status).toBe('mismatched');
    expect(result.transactions[0].status).toBe('mismatched');
  });
  it('shows a chain-only event with its evidence without assuming why it is missing from the database', async () => {
    const { service } = fixture({}, false, null);
    const result = await service.verify('p', 'dao');
    expect(result.comparisons).toContainEqual(
      expect.objectContaining({
        field: `governance_event:${hash}:0`,
        database: null,
        blockchain: expect.objectContaining({
          name: 'ProposalCreated',
          transaction_hash: hash,
        }),
        status: 'unverified',
      }),
    );
  });

  it('pins a block, reuses the deployed ABI and verifies proposal, votes, events and receipts', async () => {
    const { service, rpc } = fixture(),
      result = await service.verify('p', 'dao');
    expect(result.status).toBe('verified');
    expect(result.block_number).toBe('100');
    expect(result.events).toHaveLength(1);
    expect(result.transactions[0].status).toBe('verified');
    expect(result.comparisons.every((c) => c.status === 'verified')).toBe(true);
    expect(
      rpc.mock.calls
        .filter((c) => c[0] === 'eth_call')
        .every((c) => (c[1] as any[])[1] === '0x64'),
    ).toBe(true);
    expect(rpc.mock.calls.every((c) => !String(c[0]).includes('send'))).toBe(
      true,
    );
  });
  it('reports database mismatches rather than altering data', async () => {
    const { service } = fixture({ metadata_hash: '0x' + '66'.repeat(32) });
    const result = await service.verify('p');
    expect(result.status).toBe('mismatched');
    expect(
      result.comparisons.find((c) => c.field === 'metadata_hash')?.status,
    ).toBe('mismatched');
  });
  it('maps finalized records to closed while independently checking finalization', async () => {
    const { service, rpc } = fixture({
      status: 'FINALIZED',
      finalized_at: new Date(2000 * 1000),
      winning_option: '0',
      tied: false,
    });
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (...args: any[]) => {
      const [method, params] = args;
      const response = await original(...args);
      if (method !== 'eth_call') return response;
      const call = abi.parseTransaction({ data: params[0].data });
      if (call?.name !== 'getProposal') return response;
      const proposal = abi
        .decodeFunctionResult('getProposal', response)[0]
        .toArray();
      proposal[10] = true;
      return abi.encodeFunctionResult('getProposal', [proposal]);
    });
    const result = await service.verify('p');
    expect(result.status).toBe('verified');
    expect(
      result.comparisons.find((c) => c.field === 'voting_status'),
    ).toMatchObject({
      database: 'Closed',
      blockchain: 'Closed',
      status: 'verified',
    });
    expect(
      result.comparisons.find((c) => c.field === 'finalized'),
    ).toMatchObject({
      database: true,
      blockchain: true,
      status: 'verified',
    });
  });
  it('reports RPC failure without fabricated blockchain facts', async () => {
    const { service, rpc } = fixture();
    rpc.mockRejectedValue(new Error('RPC down'));
    const result = await service.verify('p');
    expect(result.status).toBe('unavailable');
    expect(result.proposal).toBeUndefined();
  });
  it('does not verify unpublished proposals', async () => {
    const { service, rpc } = fixture({ on_chain_id: null });
    expect((await service.verify('p')).status).toBe('unverified');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects an unauthorized DAO before any RPC access', async () => {
    const { service, rpc } = fixture();
    await expect(service.verify('p', 'other-dao')).rejects.toThrow('outside');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('detects chain reorganization and withdraws verification', async () => {
    const { service, rpc } = fixture();
    const original = rpc.getMockImplementation()!;
    let blocks = 0;
    rpc.mockImplementation(async (...args: any[]) =>
      args[0] === 'eth_getBlockByNumber' && ++blocks > 1
        ? { hash: '0x' + '77'.repeat(32) }
        : original(...args),
    );
    const result = await service.verify('p');
    expect(result.status).toBe('unverified');
    expect(result.errors.join(' ')).toContain('reorganization');
  });
  it('marks a missing receipt unavailable rather than mismatched', async () => {
    const { service, rpc } = fixture();
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (...args: any[]) =>
      args[0] === 'eth_getTransactionReceipt' ? null : original(...args),
    );
    const result = await service.verify('p');
    expect(result.status).toBe('unavailable');
    expect(result.transactions[0].status).toBe('unavailable');
  });
  it('does not infer a missing stored vote total', async () => {
    const { service } = fixture({ total_votes: null });
    expect((await service.verify('p')).status).toBe('unverified');
  });
  it('protects the internal endpoint with the server token', async () => {
    const { service } = fixture();
    const controller = new BlockchainVerificationController(service, config);
    expect(() => controller.verify('p', 'dao', 'Bearer attacker')).toThrow(
      'authentication',
    );
    await expect(
      controller.verify('p', 'dao', 'Bearer test-operator-token'),
    ).resolves.toHaveProperty('status', 'verified');
  });
});

describe('Verification HTTP integration with isolated SQL/RPC fixtures', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const { service } = fixture();
    const module = await Test.createTestingModule({
      controllers: [BlockchainVerificationController],
      providers: [
        { provide: BlockchainVerificationService, useValue: service },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });
  it.each([
    [undefined, 'dao', 401],
    ['Bearer test-operator-token', 'other', 403],
    ['Bearer test-operator-token', 'dao', 200],
  ])(
    'enforces server token and DAO scope',
    async (authorization, dao, status) => {
      const result = await app.inject({
        method: 'GET',
        url: `/ai/internal/proposals/p/verification?dao_id=${dao}`,
        headers: authorization ? { authorization } : {},
      });
      expect(result.statusCode).toBe(status);
      if (status === 200)
        expect(JSON.parse(result.body)).toMatchObject({
          status: 'verified',
          indexer_checkpoint: { status: 'current' },
        });
    },
  );
});

describe('Bounded historical scan', () => {
  function scan(
    failed?: 'timeout' | 'missing' | 'wrong-range',
    target = 2_001_001,
  ) {
    const { service, rpc } = fixture({}, true, {
      processed_block_number: String(target),
      processed_block_hash: blockHash,
    });
    const original = rpc.getMockImplementation()!;
    const pin = '0x' + target.toString(16);
    rpc.mockImplementation(async (...args: any[]) => {
      const [method, params] = args;
      if (method === 'eth_blockNumber') return pin;
      if (method === 'eth_getBlockByNumber')
        return { hash: blockHash, number: pin, timestamp: '0xbb8' };
      if (method === 'eth_getLogs') {
        const first = BigInt(params[0].fromBlock) === 1n;
        if (first) {
          const batch = await original(...args);
          return [...batch, ...batch];
        }
        if (BigInt(params[0].fromBlock) === 1001n) {
          if (failed === 'timeout') throw new Error('timeout');
          if (failed === 'missing') return undefined;
          if (failed === 'wrong-range') return original(...args);
        }
        return [];
      }
      return original(...args);
    });
    return service.verify('p');
  }

  it('verifies a history beyond the former cap and deduplicates returned logs', async () => {
    const result = await scan();
    expect(result.status).toBe('verified');
    expect(result.events).toHaveLength(1);
    expect(result.event_scan).toMatchObject({
      status: 'complete',
      completed_ranges: 2002,
      scanned_through: '2001001',
    });
  });

  it.each(['timeout', 'missing', 'wrong-range'] as const)(
    'retains only contiguous progress when a page is %s',
    async (failure) => {
      const result = await scan(failure, 3000);
      expect(result.status).toBe('unavailable');
      expect(result.event_scan).toMatchObject({
        status: 'unavailable',
        completed_ranges: 1,
        scanned_through: '1000',
        next_block: '1001',
      });
      expect(
        result.comparisons.find((c) => c.field === 'governance_events.count'),
      ).toBeUndefined();
    },
  );

  it('reports a bounded partial scan beyond the page budget', async () => {
    const result = await scan(undefined, 5_000_001);
    expect(result.status).toBe('unverified');
    expect(result.event_scan).toMatchObject({
      status: 'partial',
      completed_ranges: 5000,
      scanned_through: '5000000',
      next_block: '5000001',
    });
  });
});

describe('Freshness observability boundary', () => {
  it('cannot distinguish a coherently stale view from identical healthy RPC inputs', async () => {
    const healthy = fixture();
    const staleScenario = fixture();
    const first = await healthy.service.verify('p');
    const second = await staleScenario.service.verify('p');
    expect(first.status).toBe('verified');
    expect(second.status).toBe(first.status);
    expect(second.block_number).toBe(first.block_number);
    expect(second.block_hash).toBe(first.block_hash);
    expect(staleScenario.rpc.mock.calls).toEqual(healthy.rpc.mock.calls);
  });
});
