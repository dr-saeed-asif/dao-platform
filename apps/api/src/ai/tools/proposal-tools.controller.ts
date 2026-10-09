import {
  BadRequestException,
  Body,
  Controller,
  GatewayTimeoutException,
  HttpCode,
  InternalServerErrorException,
  Post,
} from '@nestjs/common';
import { ToolRegistry } from './tool-registry';
import { ToolExecutionError } from './tool.types';
import type { ListProposalsOutput } from './offchain/proposal.tools';

/** Public governance read access, matching the existing GET /proposals endpoint. */
@Controller('ai/tools')
export class ProposalToolsController {
  constructor(private readonly registry: ToolRegistry) {}

  @Post('list-proposals')
  @HttpCode(200)
  async list(@Body() input: unknown): Promise<ListProposalsOutput> {
    try {
      const { result } = await this.registry.invoke(
        'sql',
        'listProposals',
        input,
      );
      return result as ListProposalsOutput;
    } catch (error) {
      if (error instanceof ToolExecutionError && error.code === 'INVALID_INPUT')
        throw new BadRequestException(error.message);
      if (error instanceof ToolExecutionError && error.code === 'TIMEOUT')
        throw new GatewayTimeoutException(error.message);
      throw new InternalServerErrorException('Unable to list proposals.');
    }
  }
}
