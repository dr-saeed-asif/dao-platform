import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetProposalVotesQuery, GetProposalVotesResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetProposalVotesInput, GetProposalVotesOutput, getProposalVotesInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-proposal-votes.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-proposal-votes.contracts';

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

