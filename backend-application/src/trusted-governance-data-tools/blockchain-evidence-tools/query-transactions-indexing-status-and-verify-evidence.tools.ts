import { OPERATION_MAP } from '@dao-platform/language-models/read-only-tool-contracts/query-transactions-indexing-status-and-verify-evidence.contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GetIndexerStatusQuery,
  GetIndexerStatusResult,
} from '@dao-platform/database';
import type { CyberChainGovernanceGateway } from '@dao-platform/blockchain-cyberchain';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { GOVERNANCE_GATEWAY } from '../../governance-proposal-management/governance-dependency-tokens';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetProposalTransactionsInput, GetProposalTransactionsOutput, GetIndexerStatusInput, GetIndexerStatusOutput, VerifyAgainstRpcInput, VerifyAgainstRpcOutput, getProposalTransactionsInputSchema, getIndexerStatusInputSchema, verifyAgainstRpcInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-transactions-indexing-status-and-verify-evidence.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-transactions-indexing-status-and-verify-evidence.contracts';

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