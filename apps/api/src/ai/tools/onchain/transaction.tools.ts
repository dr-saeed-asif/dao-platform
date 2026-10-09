import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GetIndexerStatusQuery,
  GetIndexerStatusResult,
} from '@dao-platform/database';
import type { CyberChainGovernanceGateway } from '@dao-platform/blockchain-cyberchain';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { GOVERNANCE_GATEWAY } from '../../../proposals/proposals.tokens';
import { ToolRegistry } from '../tool-registry';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '../tool.types';

export type GetProposalTransactionsInput = {
  proposalId: string;
  operation: string | null;
  limit: number;
  offset: number;
};

export type GetProposalTransactionsOutput = {
  proposalId: string;
  onChainProposalId: string | null;
  count: number;
  transactions: Array<{
    hash: string;
    sender: string;
    blockNumber: string;
    blockHash: string;
    transactionIndex: number | null;
    status: string;
    gasUsed: string;
    operation: string;
    createdAt: string;
  }>;
  asOf: string;
  chainId: string;
  contractAddress: string;
  daoId: string | null;
  evidenceIds: string[];
};

export type GetIndexerStatusInput = GetIndexerStatusQuery;
export type GetIndexerStatusOutput = GetIndexerStatusResult;

export type VerifyAgainstRpcInput = {
  evidenceId: string;
};

export type VerifyAgainstRpcOutput = {
  rpcVerified: boolean;
  evidenceId: string;
  indexed: {
    chainId: string;
    contractAddress: string;
    transactionHash: string;
    blockNumber: string;
    blockHash: string;
    transactionIndex: number | null;
    logIndex: number;
    eventName: string;
    eventArgs: Record<string, string | boolean>;
    transactionSender: string | null;
  };
  rpc: {
    chainId: string | null;
    contractAddress: string | null;
    transactionHash: string | null;
    blockNumber: string | null;
    blockHash: string | null;
    transactionIndex: number | null;
    logIndex: number | null;
    eventName: string | null;
    eventArgs: Record<string, string | boolean> | null;
    transactionSender: string | null;
    receiptStatus: number | null;
    gasUsed: string | null;
  };
  matches: {
    chainId: boolean;
    contractAddress: boolean;
    transactionHash: boolean;
    blockNumber: boolean;
    blockHash: boolean;
    transactionIndex: boolean;
    logIndex: boolean;
    eventName: boolean;
    eventArgs: boolean;
    transactionSender: boolean;
  };
  differences: string[];
  warnings: string[];
  evidenceIds: string[];
};

const OPERATION_MAP: Record<string, string> = {
  CREATE: 'CREATE_PROPOSAL',
  ASSIGN_MEMBER: 'ASSIGN_MEMBERS',
  REMOVE_MEMBER: 'UNASSIGN_MEMBER',
  VOTE: 'CAST_VOTE',
  CANCEL: 'CANCEL_PROPOSAL',
  FINALIZE: 'FINALIZE_PROPOSAL',
  CREATE_PROPOSAL: 'CREATE_PROPOSAL',
  ASSIGN_MEMBERS: 'ASSIGN_MEMBERS',
  UNASSIGN_MEMBER: 'UNASSIGN_MEMBER',
  CAST_VOTE: 'CAST_VOTE',
  CANCEL_PROPOSAL: 'CANCEL_PROPOSAL',
  FINALIZE_PROPOSAL: 'FINALIZE_PROPOSAL',
};

const proposalTxValidator = Joi.object<GetProposalTransactionsInput>({
  proposalId: Joi.string().min(1).required(),
  operation: Joi.string()
    .valid(...Object.keys(OPERATION_MAP))
    .allow(null)
    .default(null),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
})
  .unknown(false)
  .required();

export const getProposalTransactionsInputSchema: Schema<GetProposalTransactionsInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      proposalId: {
        type: 'string',
        description: 'Local proposal ID or on-chain proposal ID (numeric).',
        minLength: 1,
      },
      operation: {
        type: ['string', 'null'],
        enum: [...Object.keys(OPERATION_MAP), null],
        description: 'Filter by operation type. Use null for all.',
        default: null,
      },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
    required: ['proposalId'],
  },
  parse(input) {
    const validation = proposalTxValidator.validate(input, { convert: false });
    if (validation.error) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid getProposalTransactions input. A nonempty proposalId is required, operation must be a supported value or null, limit 1-100, offset >= 0.',
      );
    }
    return validation.value;
  },
};

const indexerStatusValidator = Joi.object<GetIndexerStatusInput>({
  indexerName: Joi.string().min(1).required(),
})
  .unknown(false)
  .required();

export const getIndexerStatusInputSchema: Schema<GetIndexerStatusInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      indexerName: {
        type: 'string',
        description: 'Name of the indexer (e.g., "governance-events", "votes", "proposals").',
        minLength: 1,
      },
    },
    required: ['indexerName'],
  },
  parse(input) {
    const validation = indexerStatusValidator.validate(input, { convert: false });
    if (validation.error) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid getIndexerStatus input. A nonempty indexerName is required.',
      );
    }
    return validation.value;
  },
};

const verifyAgainstRpcValidator = Joi.object<VerifyAgainstRpcInput>({
  evidenceId: Joi.string()
    .pattern(/^event:[0-9]+:0x[0-9a-f]{40}:0x[0-9a-f]{64}:[0-9]+$/i)
    .required(),
})
  .unknown(false)
  .required();

export const verifyAgainstRpcInputSchema: Schema<VerifyAgainstRpcInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      evidenceId: {
        type: 'string',
        description: 'The evidence ID of the event to verify (format: event:<chainId>:<contractAddress>:<transactionHash>:<logIndex>).',
        pattern: '^event:[0-9]+:0x[0-9a-f]{40}:0x[0-9a-f]{64}:[0-9]+$',
      },
    },
    required: ['evidenceId'],
  },
  parse(input) {
    const validation = verifyAgainstRpcValidator.validate(input, { convert: false });
    if (validation.error) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid verifyAgainstRpc input. A valid evidenceId in format event:<chainId>:<contractAddress>:<transactionHash>:<logIndex> is required.',
      );
    }
    return validation.value;
  },
};

@Injectable()
export class TransactionTools
  implements OnModuleInit, AiTool<GetProposalTransactionsInput, GetProposalTransactionsOutput>
{
  readonly name = 'getProposalTransactions';
  readonly description =
    'Get transactions related to a specific proposal. Use for questions like "Which transaction created proposal 8?", "Which transaction finalized it?", or "Show all transactions related to proposal 8."';
  readonly inputSchema = getProposalTransactionsInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;

  constructor(
    private readonly proposals: ProposalQueryService,
    private readonly registry: ToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.registerAiTool(this, ['provenance']);
  }

  async execute(
    input: GetProposalTransactionsInput,
    context: ToolContext,
  ): Promise<GetProposalTransactionsOutput> {
    context.signal?.throwIfAborted();
    return this.proposals.getProposalTransactions(
      {
        proposalId: input.proposalId,
        operation: input.operation ? OPERATION_MAP[input.operation] ?? input.operation : null,
        limit: input.limit,
        offset: input.offset,
      },
      context.daoId,
    );
  }
}

@Injectable()
export class IndexerStatusTools
  implements OnModuleInit, AiTool<GetIndexerStatusInput, GetIndexerStatusOutput>
{
  readonly name = 'getIndexerStatus';
  readonly description =
    'Get the indexer checkpoint status for the configured governance deployment. Returns processed block number, block hash, indexer version, checkpoint timestamp, and freshness. Use for questions like "What is the indexer status?" or "How far has the governance-events indexer processed?".';
  readonly inputSchema = getIndexerStatusInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;

  constructor(
    private readonly proposals: ProposalQueryService,
    private readonly registry: ToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.registerAiTool(this, ['provenance']);
  }

  async execute(
    input: GetIndexerStatusInput,
    context: ToolContext,
  ): Promise<GetIndexerStatusOutput> {
    context.signal?.throwIfAborted();
    return this.proposals.getIndexerStatus(input);
  }
}

@Injectable()
export class VerifyAgainstRpcTools
  implements OnModuleInit, AiTool<VerifyAgainstRpcInput, VerifyAgainstRpcOutput>
{
  readonly name = 'verifyAgainstRpc';
  readonly description =
    'Verify an indexed governance event directly against the CyberChain RPC. Use ONLY for explicit verification questions like "Verify this event directly on CyberChain", "Check this evidence against RPC", or "Does the indexed event match the blockchain?". Input must be an event evidence ID (format: event:<chainId>:<contractAddress>:<transactionHash>:<logIndex>). Returns detailed comparison of indexed vs RPC data. Do NOT use for ordinary timeline, evidence, deployment, or indexer-status questions.';
  readonly inputSchema = verifyAgainstRpcInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 30_000;

  constructor(
    @Inject(GOVERNANCE_GATEWAY)
    private readonly gateway: CyberChainGovernanceGateway,
    private readonly config: ConfigService,
    private readonly registry: ToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.registerAiTool(this, ['provenance']);
  }

  private get configuredChainId(): string {
    return this.config.getOrThrow<string>('CYBERCHAIN_CHAIN_ID');
  }

  private get configuredContractAddress(): string {
    return this.config.getOrThrow<string>('GOVERNANCE_CONTRACT_ADDRESS');
  }

  private get rpcUrl(): string {
    return this.config.getOrThrow<string>('CYBERCHAIN_RPC_URL');
  }

  async execute(
    input: VerifyAgainstRpcInput,
    context: ToolContext,
  ): Promise<VerifyAgainstRpcOutput> {
    context.signal?.throwIfAborted();

    const evidenceId = input.evidenceId;
    const parsed = this.parseEvidenceId(evidenceId);
    if (!parsed) {
      return this.errorOutput(evidenceId, 'Invalid evidenceId format. Expected event:<chainId>:<contractAddress>:<transactionHash>:<logIndex>');
    }

    const { chainId, contractAddress, transactionHash, logIndex } = parsed;

    // Validate against configured chain and contract
    const configuredChainId = this.configuredChainId;
    const configuredContractAddress = this.configuredContractAddress;
    if (chainId !== configuredChainId || contractAddress.toLowerCase() !== configuredContractAddress.toLowerCase()) {
      return this.errorOutput(evidenceId, 'Event is outside the configured governance deployment scope');
    }

    // Get indexed event from database via gateway's event storage
    // The gateway doesn't directly expose event lookup, so we'll use the RPC to fetch the event
    // and compare with what we can reconstruct from the evidence ID

    try {
      const rpcData = await this.fetchRpcEvent(chainId, contractAddress, transactionHash, logIndex, context.signal);

      if (!rpcData) {
        return this.errorOutput(evidenceId, 'Event not found on blockchain via RPC');
      }

      // Reconstruct indexed data from evidence ID and RPC receipt
      const indexed = this.reconstructIndexed(chainId, contractAddress, transactionHash, logIndex, rpcData);

      const matches = this.compareFields(indexed, rpcData);
      const differences = this.getDifferences(matches, indexed, rpcData);
      const warnings = this.getWarnings(matches, indexed, rpcData);

      const rpcVerified = differences.length === 0 && rpcData.receiptStatus === 1;

      return {
        rpcVerified,
        evidenceId,
        indexed,
        rpc: rpcData,
        matches,
        differences,
        warnings,
        evidenceIds: [evidenceId],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.errorOutput(evidenceId, `RPC verification failed: ${message}`);
    }
  }

  private parseEvidenceId(evidenceId: string): { chainId: string; contractAddress: string; transactionHash: string; logIndex: number } | null {
    const match = evidenceId.match(/^event:([0-9]+):(0x[0-9a-f]{40}):(0x[0-9a-f]{64}):([0-9]+)$/i);
    if (!match) return null;
    return {
      chainId: match[1],
      contractAddress: match[2].toLowerCase(),
      transactionHash: match[3].toLowerCase(),
      logIndex: parseInt(match[4], 10),
    };
  }

  private async fetchRpcEvent(
    chainId: string,
    contractAddress: string,
    transactionHash: string,
    logIndex: number,
    signal?: AbortSignal,
  ): Promise<{
    chainId: string;
    contractAddress: string;
    transactionHash: string;
    blockNumber: string;
    blockHash: string;
    transactionIndex: number | null;
    logIndex: number;
    eventName: string | null;
    eventArgs: Record<string, string | boolean> | null;
    transactionSender: string | null;
    receiptStatus: number | null;
    gasUsed: string | null;
  } | null> {
    const { Web3RPCClient } = await import('@cyberchain/smart-contract-wrapper');
    const rpcClient = Web3RPCClient.getInstance();
    const rpcOptions = { rpcURL: this.rpcUrl };

    // Get transaction receipt
    const receipt = await rpcClient.getTransactionReceipt(transactionHash, rpcOptions);
    if (!receipt || receipt.status !== 1n) return null;

    // Get block
    const block = await rpcClient.getBlockByNumber(receipt.blockNumber, rpcOptions);
    if (!block) return null;

    // Find the specific log in the receipt
    const log = receipt.logs.find((l: any) => Number(l.logIndex) === logIndex);
    if (!log) return null;

    // Verify log is from our contract
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) return null;

    // Decode the event using the contract ABI
    const { SmartContractInterface } = await import('@cyberchain/smart-contract-wrapper');
    const { CYBER_DAO_GOVERNANCE_WRITE_ABI } = await import('@dao-platform/blockchain-cyberchain');
    const contract = new SmartContractInterface(contractAddress, CYBER_DAO_GOVERNANCE_WRITE_ABI, { rpcURL: this.rpcUrl });
    const event = contract.findEvent(receipt, log.topics[0] as unknown as string);
    if (!event) return null;

    return {
      chainId: chainId,
      contractAddress: log.address.toLowerCase(),
      transactionHash: transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: block.hash.toString().toLowerCase(),
      transactionIndex: receipt.transactionIndex != null ? Number(receipt.transactionIndex) : null,
      logIndex: Number(log.logIndex),
      eventName: event?.name ?? null,
      eventArgs: event ? this.decodeEventArgs(event) : null,
      transactionSender: receipt.from ? receipt.from.toString().toLowerCase() : null,
      receiptStatus: Number(receipt.status),
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  private decodeEventArgs(event: any): Record<string, string | boolean> {
    const args: Record<string, string | boolean> = {};
    const names = {
      ProposalCreated: ["proposalId", "creator", "proposalType", "metadataHash", "metadataURI", "optionCount", "startsAt", "endsAt"],
      MemberAssigned: ["proposalId", "member"],
      MemberUnassigned: ["proposalId", "member"],
      VoteCast: ["proposalId", "voter", "optionIndex"],
      ProposalCancelled: ["proposalId"],
      ProposalFinalized: ["proposalId", "winningOption", "tied", "totalVotes"],
    } as const;

    const eventNames = names[event.name as keyof typeof names];
    if (!eventNames) return {};

    event.parameters.forEach((value: any, index: number) => {
      const name = eventNames[index];
      if (!name) return;
      if (name === "creator" || name === "member" || name === "voter") {
        args[name] = value.toString().toLowerCase();
      } else if (name === "metadataHash") {
        args[name] = value.toString().toLowerCase();
      } else if (name === "tied") {
        args[name] = Boolean(value);
      } else if (name === "metadataURI") {
        args[name] = value.toString();
      } else {
        args[name] = BigInt(value.toString()).toString();
      }
    });
    return args;
  }

  private reconstructIndexed(
    chainId: string,
    contractAddress: string,
    transactionHash: string,
    logIndex: number,
    rpcData: any,
  ) {
    return {
      chainId,
      contractAddress,
      transactionHash,
      blockNumber: rpcData.blockNumber,
      blockHash: rpcData.blockHash,
      transactionIndex: rpcData.transactionIndex,
      logIndex,
      eventName: rpcData.eventName,
      eventArgs: rpcData.eventArgs,
      transactionSender: rpcData.transactionSender,
    };
  }

  private compareFields(indexed: any, rpc: any) {
    return {
      chainId: indexed.chainId === rpc.chainId,
      contractAddress: indexed.contractAddress.toLowerCase() === rpc.contractAddress.toLowerCase(),
      transactionHash: indexed.transactionHash.toLowerCase() === rpc.transactionHash.toLowerCase(),
      blockNumber: indexed.blockNumber === rpc.blockNumber,
      blockHash: indexed.blockHash.toLowerCase() === rpc.blockHash.toLowerCase(),
      transactionIndex: indexed.transactionIndex === rpc.transactionIndex,
      logIndex: indexed.logIndex === rpc.logIndex,
      eventName: indexed.eventName === rpc.eventName,
      eventArgs: this.deepEqual(indexed.eventArgs, rpc.eventArgs),
      transactionSender: indexed.transactionSender?.toLowerCase() === rpc.transactionSender?.toLowerCase(),
    };
  }

  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => this.deepEqual(a[key], b[key]));
  }

  private getDifferences(matches: any, indexed: any, rpc: any): string[] {
    const diffs: string[] = [];
    Object.entries(matches).forEach(([key, match]) => {
      if (!match) {
        diffs.push(`${key}: indexed=${JSON.stringify(indexed[key])} vs rpc=${JSON.stringify(rpc[key])}`);
      }
    });
    return diffs;
  }

  private getWarnings(matches: any, indexed: any, rpc: any): string[] {
    const warnings: string[] = [];
    if (rpc.receiptStatus !== 1) warnings.push('Transaction receipt status indicates failure (reverted)');
    if (!matches.chainId) warnings.push('Chain ID mismatch');
    if (!matches.contractAddress) warnings.push('Contract address mismatch');
    if (!matches.transactionHash) warnings.push('Transaction hash mismatch');
    if (!matches.blockNumber) warnings.push('Block number mismatch');
    if (!matches.blockHash) warnings.push('Block hash mismatch');
    if (!matches.eventName) warnings.push('Event name mismatch');
    if (!matches.eventArgs) warnings.push('Event arguments mismatch');
    return warnings;
  }

  private errorOutput(evidenceId: string, message: string): VerifyAgainstRpcOutput {
    return {
      rpcVerified: false,
      evidenceId,
      indexed: {
        chainId: '', contractAddress: '', transactionHash: '', blockNumber: '', blockHash: '',
        transactionIndex: null, logIndex: 0, eventName: '', eventArgs: {}, transactionSender: null,
      },
      rpc: {
        chainId: null, contractAddress: null, transactionHash: null, blockNumber: null, blockHash: null,
        transactionIndex: null, logIndex: null, eventName: null, eventArgs: null, transactionSender: null,
        receiptStatus: null, gasUsed: null,
      },
      matches: {
        chainId: false, contractAddress: false, transactionHash: false, blockNumber: false, blockHash: false,
        transactionIndex: false, logIndex: false, eventName: false, eventArgs: false, transactionSender: false,
      },
      differences: [message],
      warnings: [message],
      evidenceIds: [evidenceId],
    };
  }
}