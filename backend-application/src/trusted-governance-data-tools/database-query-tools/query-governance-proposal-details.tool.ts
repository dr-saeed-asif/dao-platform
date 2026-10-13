import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetProposalDetailsQuery, GetProposalDetailsResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetProposalDetailsInput, GetProposalDetailsOutput, getProposalDetailsInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-governance-proposal-details.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-governance-proposal-details.contracts';

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

