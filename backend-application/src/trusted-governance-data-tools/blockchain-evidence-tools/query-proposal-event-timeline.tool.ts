import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import { ProposalQueryService, type ProposalTimelineResult } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetProposalTimelineInput, GetProposalTimelineOutput, getProposalTimelineInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-proposal-event-timeline.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-proposal-event-timeline.contracts';

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

