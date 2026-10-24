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
function fixture(overrides: Record<string, unknown> = {}) {
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
        where: () => q,
        executeTakeFirst: async () => ({ ...p, ...overrides }),
        execute: async () => (table === 'votes' ? [] : [stored]),
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
      if (method === 'eth_getBlockByNumber') return { hash: blockHash };
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
  return { service, rpc };
}
describe('Read-only blockchain verification', () => {
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
