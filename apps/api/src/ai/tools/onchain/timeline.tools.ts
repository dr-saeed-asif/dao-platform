import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import { ProposalQueryService, type ProposalTimelineResult } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '../tool.types';

export interface GetProposalTimelineInput { proposalId: string }
export type GetProposalTimelineOutput = ProposalTimelineResult;
const validator = Joi.object({ proposalId: Joi.string().trim().min(1).required() }).unknown(false).required();
export const getProposalTimelineInputSchema: Schema<GetProposalTimelineInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: { proposalId: { type: 'string', minLength: 1 } }, required: ['proposalId'] },
  parse(input) {
    const result = validator.validate(input, { convert: false });
    if (result.error) throw new ToolExecutionError('INVALID_INPUT', 'A nonempty proposalId is required.');
    return result.value;
  },
};

@Injectable()
export class TimelineTools implements OnModuleInit, AiTool<GetProposalTimelineInput, GetProposalTimelineOutput> {
  readonly name = 'getProposalTimeline';
  readonly description = 'Get canonical on-chain governance events for a proposal in deterministic block, transaction, and log order.';
  readonly inputSchema = getProposalTimelineInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;
  constructor(private readonly proposals: ProposalQueryService, private readonly registry: ToolRegistry) {}
  onModuleInit() { this.registry.registerAiTool(this, ['sql']); }
  execute(input: GetProposalTimelineInput, context: ToolContext) {
    context.signal?.throwIfAborted();
    return this.proposals.getProposalTimeline({ proposalId: input.proposalId, daoId: context.daoId ?? null });
  }
}

