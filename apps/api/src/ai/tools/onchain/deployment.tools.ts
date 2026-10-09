import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetContractDeploymentResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '../tool.types';

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

@Injectable()
export class DeploymentTools
  implements OnModuleInit, AiTool<GetContractDeploymentInput, GetContractDeploymentOutput>
{
  readonly name = 'getContractDeployment';
  readonly description =
    'Get the verified governance contract deployment identity. Returns chain ID, contract address, deployment transaction, block info, and version metadata. Use for questions about contract identity and deployment.';
  readonly inputSchema = getContractDeploymentInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;

  constructor(
    private readonly proposals: ProposalQueryService,
    private readonly registry: ToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.registerAiTool(this, ['provenance']);
  }

  async execute(
    _input: GetContractDeploymentInput,
    context: ToolContext,
  ): Promise<GetContractDeploymentOutput> {
    context.signal?.throwIfAborted();
    return this.proposals.getContractDeployment();
  }
}
