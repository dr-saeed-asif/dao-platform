import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type {
  DaoStatisticsQuery,
  DaoStatisticsResult,
} from '@dao-platform/database';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetDaoStatisticsInput, GetDaoStatisticsOutput, getDaoStatisticsInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-governance-statistics.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-governance-statistics.contracts';

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