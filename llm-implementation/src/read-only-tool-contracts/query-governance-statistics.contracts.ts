import Joi from 'joi';
import type {
  DaoStatisticsQuery,
  DaoStatisticsResult,
} from '@dao-platform/database';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';



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

