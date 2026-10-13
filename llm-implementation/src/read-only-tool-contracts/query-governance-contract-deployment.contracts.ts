import Joi from 'joi';
import type { GetContractDeploymentResult } from '@dao-platform/database';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';



export type GetContractDeploymentInput = Record<string, never>;
export type GetContractDeploymentOutput = GetContractDeploymentResult;

const validator = Joi.object<GetContractDeploymentInput>({})
  .unknown(false)
  .required();

export const getContractDeploymentInputSchema: Schema<GetContractDeploymentInput> = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  parse(input) {
    const validation = validator.validate(input, { convert: false });
    if (validation.error) {
      throw new ToolExecutionError(
        'INVALID_INPUT',
        'Invalid getContractDeployment input.',
      );
    }
    return validation.value;
  },
};

