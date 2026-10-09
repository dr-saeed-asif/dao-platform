import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetProposalVotesQuery, GetProposalVotesResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '../tool.types';

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

@Injectable()
export class ProposalVotesTools implements OnModuleInit, AiTool<GetProposalVotesInput, GetProposalVotesOutput> {
  readonly name = 'getProposalVotes';
  readonly description = 'Get proposal votes, option totals, winning option, voter and transaction sender details, and evidence.';
  readonly inputSchema = getProposalVotesInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;
  constructor(private readonly proposals: ProposalQueryService, private readonly registry: ToolRegistry) {}
  onModuleInit() { this.registry.registerAiTool(this, ['sql']); }
  execute(input: GetProposalVotesInput, context: ToolContext) {
    context.signal?.throwIfAborted();
    return this.proposals.getProposalVotes({ proposalId: input.proposalId, daoId: context.daoId ?? null });
  }
}

