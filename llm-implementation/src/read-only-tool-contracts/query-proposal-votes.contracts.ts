import Joi from 'joi';
import type { GetProposalVotesQuery, GetProposalVotesResult } from '@dao-platform/database';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';



export type GetProposalVotesInput = Omit<GetProposalVotesQuery, 'daoId'>;
export type GetProposalVotesOutput = GetProposalVotesResult;
const validator = Joi.object({ proposalId: Joi.string().trim().min(1).required() }).unknown(false).required();
export const getProposalVotesInputSchema: Schema<GetProposalVotesInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: { proposalId: { type: 'string', minLength: 1 } }, required: ['proposalId'] },
  parse(input) {
    const value = validator.validate(input, { convert: false });
    if (value.error) throw new ToolExecutionError('INVALID_INPUT', 'A nonempty proposalId is required.');
    return value.value;
  },
};

