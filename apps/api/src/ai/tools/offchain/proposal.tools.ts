import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type {
  ProposalListQuery,
  ProposalListResult,
} from '@dao-platform/database';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '../tool.types';

export type ListProposalsInput = ProposalListQuery;
export type ListProposalsOutput = ProposalListResult & {
  evidenceIds: string[];
};

const statuses = ['ACTIVE', 'UPCOMING', 'ENDED', 'CANCELLED', 'FINALIZED', 'APPROVED'];
// Require an explicit timezone so filtering never depends on the API host timezone.
const timestamp = Joi.string()
  .isoDate()
  .pattern(/T.*(?:Z|[+-]\d{2}:\d{2})$/i)
  .allow(null)
  .default(null);
const validator = Joi.object<ListProposalsInput>({
  status: Joi.string()
    .valid(...statuses)
    .allow(null)
    .default(null),
  from: timestamp,
  to: timestamp,
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
})
  .unknown(false)
  .required();

export const listProposalsInputSchema: Schema<ListProposalsInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: {
        type: ['string', 'null'],
        enum: [...statuses, null],
        default: null,
      },
      from: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'Inclusive voting-start lower bound.',
        default: null,
      },
      to: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'Inclusive voting-start upper bound.',
        default: null,
      },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      offset: {
        type: 'integer',
        minimum: 0,
        maximum: Number.MAX_SAFE_INTEGER,
        default: 0,
      },
    },
  },
  parse(input) {
    const validation = validator.validate(input, { convert: false });
    if (validation.error) {
      // Do not echo arbitrary input values into error messages or telemetry.
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid listProposals filters. Use a supported status, timezone-qualified dates, limit 1–100, and a nonnegative integer offset.',
      );
    }
    const query = validation.value;
    if (
      query.from &&
      query.to &&
      Date.parse(query.from) > Date.parse(query.to)
    ) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'from must be earlier than or equal to to.',
      );
    }
    return query;
  },
};

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
