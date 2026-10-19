import { ConfigService } from '@nestjs/config';
import { LIVE_ABI, LiveChainTools } from '../tools/onchain/live-chain.tools';
import { ToolRegistry } from '../tools/tool-registry';

const contract = '0x1111111111111111111111111111111111111111';
const hash = `0x${'22'.repeat(32)}`;
const block = { number: '0x100', hash, timestamp: '0x65000000' };

describe('fresh CyberChain tool', () => {
  const originalFetch = global.fetch;
  let registry: ToolRegistry;
  let rpc: jest.Mock;

  beforeEach(() => {
    registry = new ToolRegistry();
    const config = new ConfigService({ CYBERCHAIN_RPC_URL: 'http://configured-rpc',
      CYBERCHAIN_CHAIN_ID: '1212', GOVERNANCE_CONTRACT_ADDRESS: contract, GOVERNANCE_DEPLOYMENT_BLOCK: '1' });
    new LiveChainTools(config, registry).onModuleInit();
    rpc = jest.fn(async (method: string, params: any[]) => {
      if (method === 'eth_chainId') return '0x4bc';
      if (method === 'eth_getBlockByNumber') return block;
      if (method === 'eth_getCode') return '0x1234';
      if (method === 'eth_getLogs') return [];
      if (method === 'eth_getTransactionReceipt') return null;
      if (method === 'eth_call') {
        const parsed = LIVE_ABI.parseTransaction({ data: params[0].data })!;
        const values: Record<string, unknown[]> = {
          proposalCount: [34n], owner: [contract],
          getProposal: [[`0x${'00'.repeat(32)}`, 'data:ignored', 1700000000n, 1700003600n, 2, 0, 4, 3, 0, false, false, false]],
          proposalState: [2], optionVoteCount: [parsed.name === 'optionVoteCount' && parsed.args[1] === 0n ? 2 : 1], isAssigned: [true], hasVoted: [false],
        };
        return LIVE_ABI.encodeFunctionResult(parsed.name, values[parsed.name]);
      }
      throw new Error(`Unexpected RPC method ${method}`);
    });
    global.fetch = jest.fn(async (_url, options) => {
      const request = JSON.parse(options!.body as string);
      const result = await rpc(request.method, request.params);
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) } as Response;
    });
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('pins every contract read to one fresh block and decodes votes without a database', async () => {
    const { result } = await registry.invoke('provenance', 'fetchLiveCyberChain', { onChainProposalId: '32' });
    expect(result).toMatchObject({ source: 'live-cyberchain-rpc', proposalCount: '34', blockNumber: '256', blockHash: hash,
      proposal: { id: '32', state: 'CLOSED', voteCount: 3, optionVotes: ['2', '1'] } });
    expect(rpc.mock.calls.filter(([method]) => method === 'eth_call').every(([, params]) => params[1] === '0x100')).toBe(true);
    expect(rpc.mock.calls.filter(([method]) => method === 'eth_getBlockByNumber')).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith('http://configured-rpc', expect.objectContaining({ redirect: 'error' }));
    const methods = rpc.mock.calls.map(([method]) => method);
    expect(methods).not.toContain('eth_sendTransaction');
    expect(methods).not.toContain('eth_sendRawTransaction');
  });

  it('makes another RPC read on repeated questions rather than reusing a snapshot', async () => {
    await registry.invoke('provenance', 'fetchLiveCyberChain', {});
    await registry.invoke('provenance', 'fetchLiveCyberChain', {});
    expect(rpc.mock.calls.filter(([method]) => method === 'eth_chainId')).toHaveLength(2);
  });

  it('discovers the latest proposals using fresh contract reads with an explicit limit', async () => {
    const { result } = await registry.invoke('provenance', 'fetchLiveCyberChain', { includeProposals: true });
    expect((result as any).proposals.map((p: any) => p.id)).toEqual(['34','33','32','31','30','29','28','27','26','25']);
    const reads = rpc.mock.calls.filter(([method, params]) => method === 'eth_call' && LIVE_ABI.parseTransaction({ data: params[0].data })?.name === 'getProposal');
    expect(reads).toHaveLength(10);
    expect(reads.every(([, params]) => params[1] === block.number)).toBe(true);
  });

  it('fetches a specific receipt and decodes the requested proposal event', async () => {
    const log = LIVE_ABI.encodeEventLog(LIVE_ABI.getEvent('VoteCast')!, [32, contract, 1]);
    const normal = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (method, params) => method === 'eth_getTransactionReceipt' ? {
      transactionHash: hash, blockNumber: block.number, blockHash: block.hash, status: '0x1',
      logs: [{ ...log, address: contract, transactionHash: hash, blockNumber: block.number, blockHash: block.hash, logIndex: '0x2' }],
    } : normal(method, params));
    const { result } = await registry.invoke('provenance', 'fetchLiveCyberChain', { onChainProposalId: '32', transactionHash: hash });
    expect(result).toMatchObject({ receipt: { transactionHash: hash, status: 'SUCCESS' },
      events: [{ name: 'VoteCast', args: { proposalId: '32', optionIndex: '1' }, logIndex: 2 }] });
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', { onChainProposalId: '31', transactionHash: hash }))
      .rejects.toThrow('no matching governance events');
  });

  it('rejects wrong chains before reading contract facts', async () => {
    rpc.mockImplementation(async () => '0x1');
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', {})).rejects.toThrow('different chain ID');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects a reorg instead of claiming a consistent snapshot', async () => {
    const normal = rpc.getMockImplementation()!;
    let blocks = 0;
    rpc.mockImplementation(async (method, params) => method === 'eth_getBlockByNumber' && ++blocks > 1
      ? { ...block, hash: `0x${'33'.repeat(32)}` } : normal(method, params));
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', {})).rejects.toThrow('reorganized');
  });

  it('fails on RPC errors, missing receipts and missing proposals', async () => {
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', { onChainProposalId: '35' })).rejects.toThrow('does not exist');
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', { transactionHash: hash })).rejects.toThrow('missing or not yet mined');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ error: { code: -32000 } }) });
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', {})).rejects.toThrow('could not complete');
  });

  it('rejects arbitrary URLs and contract overrides and enforces cancellation', async () => {
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', { rpcUrl: 'http://other' })).rejects.toThrow('Invalid live');
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', { contractAddress: contract })).rejects.toThrow('Invalid live');
    const controller = new AbortController(); controller.abort();
    await expect(registry.invoke('provenance', 'fetchLiveCyberChain', {}, { signal: controller.signal })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('labels bounded event coverage instead of calling an empty window complete history', async () => {
    const normal = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (method, params) => method === 'eth_getBlockByNumber' ? { ...block, number: '0x1000' } : normal(method, params));
    const { result } = await registry.invoke('provenance', 'fetchLiveCyberChain', { onChainProposalId: '32', includeEvents: true });
    expect(result).toMatchObject({ eventCoverage: { fromBlock: '3097', toBlock: '4096', completeHistory: false }, events: [] });
    const filter = rpc.mock.calls.find(([method]) => method === 'eth_getLogs')![1][0];
    expect(filter.address).toBe(contract);
    expect(filter.topics[1]).toBe(`0x${'20'.padStart(64, '0')}`);
  });
});
