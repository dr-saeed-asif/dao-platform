import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import type { GetContractDeploymentResult } from '@dao-platform/database';
import { ProposalQueryService } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetContractDeploymentInput, GetContractDeploymentOutput, getContractDeploymentInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-governance-contract-deployment.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-governance-contract-deployment.contracts';

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
