import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type {
  GetProposalMembersQuery,
  GetProposalMembersResult,
} from '@dao-platform/database';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetProposalMembersInput, GetProposalMembersOutput, getProposalMembersInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/list-proposal-members.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/list-proposal-members.contracts';

@Injectable()
export class MemberTools
  implements OnModuleInit, AiTool<GetProposalMembersInput, GetProposalMembersOutput>
{
  readonly name = 'getProposalMembers';
  readonly description =
    'Get the current assigned members for a specific proposal. Returns member addresses, voting power, and totals. Use for proposal-specific membership questions, not DAO-wide statistics.';
  readonly inputSchema = getProposalMembersInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;

  constructor(
    private readonly proposals: ProposalQueryService,
    private readonly registry: ToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.registerAiTool(this, ['sql']);
  }

  async execute(
    input: GetProposalMembersInput,
    context: ToolContext,
  ): Promise<GetProposalMembersOutput> {
    context.signal?.throwIfAborted();
    return this.proposals.getProposalMembers({
      proposalId: input.proposalId,
      daoId: context.daoId ?? null,
    });
  }
}