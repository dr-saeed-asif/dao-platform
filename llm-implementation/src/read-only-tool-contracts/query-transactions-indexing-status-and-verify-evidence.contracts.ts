import Joi from 'joi';
import type {
  GetIndexerStatusQuery,
  GetIndexerStatusResult,
} from '@dao-platform/database';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';



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

export const OPERATION_MAP: Record<string, string> = {
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

