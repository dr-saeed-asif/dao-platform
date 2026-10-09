import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetMemberActivityQuery, GetMemberActivityResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '../tool.types';

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

@Injectable()
export class MemberActivityTools implements OnModuleInit, AiTool<GetMemberActivityInput, GetMemberActivityOutput> {
  readonly name = 'getMemberActivity';
  readonly description = 'Determine whether a member voted on a proposal and return scoped assignment, vote, sender, and evidence details.';
  readonly inputSchema = getMemberActivityInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;
  constructor(private readonly proposals: ProposalQueryService, private readonly registry: ToolRegistry) {}
  onModuleInit() { this.registry.registerAiTool(this, ['sql']); }
  execute(input: GetMemberActivityInput, context: ToolContext) {
    context.signal?.throwIfAborted();
    return this.proposals.getMemberActivity({ ...input, daoId: context.daoId ?? null });
  }
}

