import Joi from 'joi';
import type {
  GetProposalMembersQuery,
  GetProposalMembersResult,
} from '@dao-platform/database';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';



export type GetProposalMembersInput = GetProposalMembersQuery;
export type GetProposalMembersOutput = GetProposalMembersResult;

const validator = Joi.object<GetProposalMembersInput>({
  proposalId: Joi.string().min(1).required(),
})
  .unknown(false)
  .required();

export const getProposalMembersInputSchema: Schema<GetProposalMembersInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      proposalId: {
        type: 'string',
        description: 'Local proposal ID or on-chain proposal ID (numeric).',
        minLength: 1,
      },
    },
    required: ['proposalId'],
  },
  parse(input) {
    const validation = validator.validate(input, { convert: false });
    if (validation.error) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid getProposalMembers input. A nonempty proposalId is required.',
      );
    }
    return validation.value;
  },
};

