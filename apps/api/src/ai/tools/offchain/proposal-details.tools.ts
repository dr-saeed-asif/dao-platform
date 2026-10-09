import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetProposalDetailsQuery, GetProposalDetailsResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '../tool.types';

export type GetProposalDetailsInput = Omit<GetProposalDetailsQuery, 'daoId'>;
export type GetProposalDetailsOutput = GetProposalDetailsResult;
const validator = Joi.object({ proposalId: Joi.string().trim().min(1).required() }).unknown(false).required();
export const getProposalDetailsInputSchema: Schema<GetProposalDetailsInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: { proposalId: { type: 'string', minLength: 1 } }, required: ['proposalId'] },
  parse(input) {
    const value = validator.validate(input, { convert: false });
    if (value.error) throw new ToolExecutionError('INVALID_INPUT', 'A nonempty proposalId is required.');
    return value.value;
  },
};

@Injectable()
export class ProposalDetailsTools implements OnModuleInit, AiTool<GetProposalDetailsInput, GetProposalDetailsOutput> {
  readonly name = 'getProposal';
  readonly description = 'Get one proposal and its options, lifecycle, dates, counts, and scoped evidence.';
  readonly inputSchema = getProposalDetailsInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;
  constructor(private readonly proposals: ProposalQueryService, private readonly registry: ToolRegistry) {}
  onModuleInit() { this.registry.registerAiTool(this, ['sql']); }
  execute(input: GetProposalDetailsInput, context: ToolContext) {
    context.signal?.throwIfAborted();
    return this.proposals.getProposalDetails({ proposalId: input.proposalId, daoId: context.daoId ?? null });
  }
}

