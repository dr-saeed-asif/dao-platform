import Joi from 'joi';
import type {
  ProposalListQuery,
  ProposalListResult,
} from '@dao-platform/database';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';



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

