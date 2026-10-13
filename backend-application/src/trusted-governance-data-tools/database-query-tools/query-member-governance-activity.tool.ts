import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetMemberActivityQuery, GetMemberActivityResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetMemberActivityInput, GetMemberActivityOutput, getMemberActivityInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-member-governance-activity.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-member-governance-activity.contracts';

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

