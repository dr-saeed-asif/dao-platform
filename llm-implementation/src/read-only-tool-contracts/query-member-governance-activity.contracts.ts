import Joi from 'joi';
import type { GetMemberActivityQuery, GetMemberActivityResult } from '@dao-platform/database';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';



export type GetMemberActivityInput = Omit<GetMemberActivityQuery, 'daoId'>;
export type GetMemberActivityOutput = GetMemberActivityResult;
const validator = Joi.object({
  proposalId: Joi.string().trim().min(1).required(),
  memberAddress: Joi.string().trim().pattern(/^0x[0-9a-fA-F]{40}$/).required(),
}).unknown(false).required();
export const getMemberActivityInputSchema: Schema<GetMemberActivityInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: { proposalId: { type: 'string', minLength: 1 }, memberAddress: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } }, required: ['proposalId', 'memberAddress'] },
  parse(input) {
    const value = validator.validate(input, { convert: false });
    if (value.error) throw new ToolExecutionError('INVALID_INPUT', 'A proposalId and valid memberAddress are required.');
    return value.value;
  },
};

