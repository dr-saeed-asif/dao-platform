import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interface, toBeHex, zeroPadValue } from 'ethers';
import Joi from 'joi';
import { ToolRegistry } from '../tool-registry';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '../tool.types';

export const LIVE_ABI = new Interface([
  'function proposalCount() view returns (uint256)',
  'function owner() view returns (address)',
  'function getProposal(uint256) view returns ((bytes32 metadataHash,string metadataURI,uint64 startsAt,uint64 endsAt,uint16 optionCount,uint16 winningOption,uint32 assignedMemberCount,uint32 voteCount,uint8 proposalType,bool cancelled,bool finalized,bool tied))',
  'function proposalState(uint256) view returns (uint8)',
  'function optionVoteCount(uint256,uint16) view returns (uint32)',
  'function isAssigned(uint256,address) view returns (bool)',
  'function hasVoted(uint256,address) view returns (bool)',
  'event ProposalCreated(uint256 indexed proposalId,address indexed creator,uint8 indexed proposalType,bytes32 metadataHash,string metadataURI,uint16 optionCount,uint64 startsAt,uint64 endsAt)',
  'event MemberAssigned(uint256 indexed proposalId,address indexed member)',
  'event MemberUnassigned(uint256 indexed proposalId,address indexed member)',
  'event VoteCast(uint256 indexed proposalId,address indexed voter,uint16 indexed optionIndex)',
  'event ProposalCancelled(uint256 indexed proposalId)',
  'event ProposalFinalized(uint256 indexed proposalId,uint16 indexed winningOption,bool tied,uint32 totalVotes)',
]);

export interface LiveChainInput {
  onChainProposalId?: string;
  transactionHash?: string;
  memberAddress?: string;
  includeEvents?: boolean;
  includeProposals?: boolean;
}
export interface LiveChainOutput {
  source: 'live-cyberchain-rpc';
  chainId: string;
  contractAddress: string;
  fetchedAt: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: string;
  proposalCount: string;
  owner: string;
  proposals?: Array<{ id: string; state: string; voteCount: number; assignedMemberCount: number }>;
  proposal?: {
    id: string; state: string; metadataHash: string; startsAt: string; endsAt: string;
    assignedMemberCount: number; voteCount: number; finalized: boolean; cancelled: boolean;
    winningOption: number | null; tied: boolean; optionVotes: string[];
  };
  member?: { address: string; assigned: boolean; hasVoted: boolean };
  events: Array<{ evidenceId: string; name: string; args: Record<string, string | boolean>;
    transactionHash: string; blockNumber: string; blockHash: string; logIndex: number }>;
  eventCoverage?: { fromBlock: string; toBlock: string; completeHistory: boolean };
  receipt?: { transactionHash: string; blockNumber: string; blockHash: string; status: string };
  evidenceIds: string[];
}

const validator = Joi.object<LiveChainInput>({
  onChainProposalId: Joi.string().pattern(/^[1-9][0-9]{0,77}$/),
  transactionHash: Joi.string().pattern(/^0x[0-9a-f]{64}$/i),
  memberAddress: Joi.string().pattern(/^0x[0-9a-f]{40}$/i),
  includeEvents: Joi.boolean().default(false),
  includeProposals: Joi.boolean().default(false),
}).unknown(false).required();

export const liveChainInputSchema: Schema<LiveChainInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: {
    onChainProposalId: { type: 'string', pattern: '^[1-9][0-9]{0,77}$' },
    transactionHash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
    memberAddress: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    includeEvents: { type: 'boolean', default: false },
    includeProposals: { type: 'boolean', default: false },
  } },
  parse(value) {
    const parsed = validator.validate(value, { convert: false });
    if (parsed.error) throw new ToolExecutionError('INVALID_INPUT', 'Invalid live CyberChain query scope.');
    if (parsed.value.memberAddress && !parsed.value.onChainProposalId)
      throw new ToolExecutionError('INVALID_INPUT', 'Select an on-chain proposal to check a member.');
    return parsed.value;
  },
};

@Injectable()
export class LiveChainTools implements OnModuleInit, AiTool<LiveChainInput, LiveChainOutput> {
  readonly name = 'fetchLiveCyberChain';
  readonly description = 'Fetch fresh CyberChain contract state, proposal/vote/member facts, transaction receipts and recent governance events via RPC. Use when asked to cross-check the blockchain or answer from on-chain data. Reads at one pinned block; never uses cached facts or signs transactions. Events cover at most the latest 1000 blocks, not full history.';
  readonly inputSchema = liveChainInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 45_000;

  constructor(private readonly config: ConfigService, private readonly registry: ToolRegistry) {}

  onModuleInit() { this.registry.registerAiTool(this, ['provenance']); }

  async execute(input: LiveChainInput, context: ToolContext): Promise<LiveChainOutput> {
    const contract = this.config.getOrThrow<string>('GOVERNANCE_CONTRACT_ADDRESS').toLowerCase();
    const expectedChain = BigInt(this.config.getOrThrow<string>('CYBERCHAIN_CHAIN_ID')).toString();
    const signal = context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs);
    const rpc = <T = any>(method: string, params: unknown[]) => this.rpc<T>(method, params, signal);
    const chain = BigInt(await rpc<string>('eth_chainId', [])).toString();
    if (chain !== expectedChain) throw new Error('CyberChain RPC returned a different chain ID.');
    const block = await rpc('eth_getBlockByNumber', ['latest', false]);
    if (!block?.hash || !block.number || !block.timestamp) throw new Error('CyberChain returned no latest block.');
    const code = await rpc<string>('eth_getCode', [contract, block.number]);
    if (!code || code === '0x' || code === '0x0') throw new Error('Configured governance contract has no code on CyberChain.');
    const call = async (name: string, args: unknown[] = []) => {
      const data = await rpc<string>('eth_call', [{ to: contract, data: LIVE_ABI.encodeFunctionData(name, args) }, block.number]);
      return LIVE_ABI.decodeFunctionResult(name, data);
    };
    const [count, owner] = await Promise.all([call('proposalCount'), call('owner')]);
    const snapshotId = `rpc:${chain}:${contract}:${block.hash}:${input.onChainProposalId ?? 'contract'}`;
    const output: LiveChainOutput = {
      source: 'live-cyberchain-rpc', chainId: chain, contractAddress: contract,
      fetchedAt: new Date().toISOString(), blockNumber: BigInt(block.number).toString(),
      blockHash: block.hash, blockTimestamp: isoSeconds(block.timestamp),
      proposalCount: count[0].toString(), owner: owner[0].toLowerCase(), events: [], evidenceIds: [snapshotId],
    };
    if (input.includeProposals) {
      const total = BigInt(output.proposalCount);
      const size = Number(total < 10n ? total : 10n);
      output.proposals = await Promise.all(Array.from({ length: size }, async (_, index) => {
        const id = (total - BigInt(index)).toString();
        const [record, state] = await Promise.all([call('getProposal', [id]), call('proposalState', [id])]);
        return { id, state: ['PENDING', 'ACTIVE', 'CLOSED', 'CANCELLED'][Number(state[0])] ?? 'UNKNOWN',
          voteCount: Number(record[0].voteCount), assignedMemberCount: Number(record[0].assignedMemberCount) };
      }));
    }
    if (input.onChainProposalId) {
      if (BigInt(input.onChainProposalId) > BigInt(output.proposalCount)) throw new Error('Proposal does not exist in the live governance contract.');
      const [record, state] = await Promise.all([call('getProposal', [input.onChainProposalId]), call('proposalState', [input.onChainProposalId])]);
      const p = record[0];
      const optionCount = Number(p.optionCount);
      if (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > 10) throw new Error('Unexpected live proposal option count.');
      const options = await Promise.all(Array.from({ length: optionCount }, (_, i) => call('optionVoteCount', [input.onChainProposalId, i])));
      output.proposal = { id: input.onChainProposalId, state: ['PENDING', 'ACTIVE', 'CLOSED', 'CANCELLED'][Number(state[0])] ?? 'UNKNOWN',
        metadataHash: p.metadataHash, startsAt: isoSeconds(p.startsAt), endsAt: isoSeconds(p.endsAt),
        assignedMemberCount: Number(p.assignedMemberCount), voteCount: Number(p.voteCount), finalized: p.finalized,
        cancelled: p.cancelled, winningOption: p.finalized && !p.tied ? Number(p.winningOption) : null,
        tied: p.tied, optionVotes: options.map(x => x[0].toString()) };
      if (input.memberAddress) {
        const [assigned, voted] = await Promise.all([call('isAssigned', [input.onChainProposalId, input.memberAddress]), call('hasVoted', [input.onChainProposalId, input.memberAddress])]);
        output.member = { address: input.memberAddress.toLowerCase(), assigned: assigned[0], hasVoted: voted[0] };
      }
    }
    if (input.transactionHash) {
      const receipt = await rpc('eth_getTransactionReceipt', [input.transactionHash]);
      if (!receipt?.blockNumber) throw new Error('Transaction is missing or not yet mined on CyberChain.');
      if (BigInt(receipt.blockNumber) > BigInt(block.number)) throw new Error('Transaction was mined after this snapshot; retry for a newer block.');
      const logs = (receipt.logs ?? []).filter((log: any) => log.address?.toLowerCase() === contract);
      output.events = logs.map((log: any) => decodeLog(log, chain, contract)).filter((event: LiveChainOutput['events'][number] | null) => event !== null);
      if (input.onChainProposalId) output.events = output.events.filter(event => event.args.proposalId === input.onChainProposalId);
      if (!output.events.length) throw new Error('Transaction contains no matching governance events for the requested scope.');
      const receiptBlock = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
      if (receiptBlock?.hash?.toLowerCase() !== receipt.blockHash?.toLowerCase()) throw new Error('Transaction receipt is not in the canonical chain.');
      output.receipt = { transactionHash: input.transactionHash, blockNumber: BigInt(receipt.blockNumber).toString(),
        blockHash: receipt.blockHash, status: BigInt(receipt.status) === 1n ? 'SUCCESS' : 'REVERTED' };
    } else if (input.includeEvents) {
      const deployment = BigInt(this.config.get<string>('GOVERNANCE_DEPLOYMENT_BLOCK', '0'));
      const head = BigInt(block.number);
      const from = head > 999n && head - 999n > deployment ? head - 999n : deployment;
      const eventTopics = LIVE_ABI.fragments.filter(f => f.type === 'event').map(f => LIVE_ABI.getEvent(f.format())!.topicHash);
      const topics: unknown[] = [eventTopics];
      if (input.onChainProposalId) topics.push(zeroPadValue(toBeHex(BigInt(input.onChainProposalId)), 32));
      const logs = await rpc<any[]>('eth_getLogs', [{ address: contract, fromBlock: toBeHex(from), toBlock: block.number, topics }]);
      if (!Array.isArray(logs)) throw new Error('CyberChain returned invalid event records.');
      output.events = logs.map(log => decodeLog(log, chain, contract)).filter((event): event is NonNullable<typeof event> => event !== null);
      output.eventCoverage = { fromBlock: from.toString(), toBlock: head.toString(), completeHistory: from === deployment };
    }
    // A reorg during the read invalidates the entire snapshot, not just its evidence label.
    const pinned = await rpc('eth_getBlockByNumber', [block.number, false]);
    if (pinned?.hash?.toLowerCase() !== block.hash.toLowerCase()) throw new Error('CyberChain reorganized during the read. Please retry.');
    output.evidenceIds.push(...output.events.map(event => event.evidenceId));
    signal.throwIfAborted();
    return output;
  }

  private async rpc<T>(method: string, params: unknown[], signal: AbortSignal): Promise<T> {
    const response = await fetch(this.config.getOrThrow<string>('CYBERCHAIN_RPC_URL'), {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) throw new Error(`CyberChain RPC HTTP ${response.status}.`);
    const body = await response.json();
    if (body.error || !('result' in body)) throw new Error(`CyberChain RPC could not complete ${method}.`);
    return body.result as T;
  }
}

function isoSeconds(value: string | bigint): string {
  return new Date(Number(BigInt(value)) * 1000).toISOString();
}

function decodeLog(log: any, chain: string, contract: string): LiveChainOutput['events'][number] | null {
  if (log.removed || log.address?.toLowerCase() !== contract) return null;
  const decoded = LIVE_ABI.parseLog(log);
  if (!decoded) return null;
  const args: Record<string, string | boolean> = {};
  decoded.fragment.inputs.forEach((field, i) => {
    const value = decoded.args[i];
    args[field.name] = typeof value === 'boolean' ? value : String(value);
  });
  return { evidenceId: `event:${chain}:${contract}:${log.transactionHash}:${Number(BigInt(log.logIndex))}`,
    name: decoded.name, args, transactionHash: log.transactionHash,
    blockNumber: BigInt(log.blockNumber).toString(), blockHash: log.blockHash, logIndex: Number(BigInt(log.logIndex)) };
}
