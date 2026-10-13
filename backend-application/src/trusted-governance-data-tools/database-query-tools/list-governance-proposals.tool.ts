import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type {
  ProposalListQuery,
  ProposalListResult,
} from '@dao-platform/database';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { ListProposalsInput, ListProposalsOutput, listProposalsInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/list-governance-proposals.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/list-governance-proposals.contracts';

@Injectable()
export class ProposalTools
  implements OnModuleInit, AiTool<ListProposalsInput, ListProposalsOutput>
{
  readonly name = 'listProposals';
  readonly description =
    'List and exactly count proposals by date-derived status and voting start date. ENDED includes cancelled and finalized proposals. Count is before pagination.';
  readonly inputSchema = listProposalsInputSchema;
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
    input: ListProposalsInput,
    context: ToolContext,
  ): Promise<ListProposalsOutput> {
    context.signal?.throwIfAborted();
    const result = await this.proposals.listProposals(input, context.daoId);
    context.signal?.throwIfAborted();
    return {
      ...result,
      evidenceIds: result.proposals.map(
        (proposal) => `structured:proposal:${proposal.proposalId}`,
      ),
    };
  }
}
