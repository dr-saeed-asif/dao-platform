import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type {
  GetProposalMembersQuery,
  GetProposalMembersResult,
} from '@dao-platform/database';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '../tool.types';

export type GetProposalMembersInput = GetProposalMembersQuery;
export type GetProposalMembersOutput = GetProposalMembersResult;

const validator = Joi.object<GetProposalMembersInput>({
  proposalId: Joi.string().min(1).required(),
})
  .unknown(false)
  .required();

export const getProposalMembersInputSchema: Schema<GetProposalMembersInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      proposalId: {
        type: 'string',
        description: 'Local proposal ID or on-chain proposal ID (numeric).',
        minLength: 1,
      },
    },
    required: ['proposalId'],
  },
  parse(input) {
    const validation = validator.validate(input, { convert: false });
    if (validation.error) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid getProposalMembers input. A nonempty proposalId is required.',
      );
    }
    return validation.value;
  },
};

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