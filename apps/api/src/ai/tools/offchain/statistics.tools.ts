import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type {
  DaoStatisticsQuery,
  DaoStatisticsResult,
} from '@dao-platform/database';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '../tool.types';

export type GetDaoStatisticsInput = DaoStatisticsQuery;
export type GetDaoStatisticsOutput = DaoStatisticsResult;

const validator = Joi.object<GetDaoStatisticsInput>({
  daoId: Joi.string().allow(null).default(null),
})
  .unknown(false)
  .required();

export const getDaoStatisticsInputSchema: Schema<GetDaoStatisticsInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      daoId: {
        type: ['string', 'null'],
        description: 'DAO identifier (scoped by context, not LLM input).',
        default: null,
      },
    },
  },
  parse(input) {
    const validation = validator.validate(input, { convert: false });
    if (validation.error) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid getDaoStatistics input.',
      );
    }
    return validation.value;
  },
};

@Injectable()
export class StatisticsTools
  implements OnModuleInit, AiTool<GetDaoStatisticsInput, GetDaoStatisticsOutput>
{
  readonly name = 'getDaoStatistics';
  readonly description =
    'Get DAO-wide aggregate statistics: proposal count, vote count, distinct member count, and artefact count. Use for DAO-wide questions, not proposal-specific queries.';
  readonly inputSchema = getDaoStatisticsInputSchema;
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
    input: GetDaoStatisticsInput,
    context: ToolContext,
  ): Promise<GetDaoStatisticsOutput> {
    context.signal?.throwIfAborted();
    return this.proposals.getDaoStatistics(context.daoId);
  }
}