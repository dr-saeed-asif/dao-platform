import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateProposalUseCase,
  GetProposalUseCase,
  ListProposalsUseCase,
} from '@dao-platform/application';
import { CreateProposalDto } from './create-proposal.dto';

@Controller('proposals')
export class ProposalsController {
  constructor(
    private readonly createProposal: CreateProposalUseCase,
    private readonly getProposal: GetProposalUseCase,
    private readonly listProposals: ListProposalsUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async create(
    @Body() body: CreateProposalDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('idempotency-key header is required.');
    }
    const actorAddress = this.developmentActor(walletAddress);
    return this.createProposal.execute({
      idempotencyKey,
      actorAddress,
      daoId: body.daoId,
      title: body.title,
      purpose: body.purpose,
      description: body.description,
      type: body.type,
      optionLabels: body.optionLabels,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      metadata: {
        metadataURI: body.metadataURI,
        metadataHash: body.metadataHash,
      },
    });
  }

  @Get()
  list(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.listProposals.execute({ limit, offset });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.getProposal.execute(id);
  }

  private developmentActor(walletAddress?: string): string {
    const enabled = this.config.get<boolean>('DEV_AUTH_BYPASS_ENABLED', false);
    const environment = this.config.get<string>('NODE_ENV');
    if (!enabled || environment === 'production') {
      throw new UnauthorizedException(
        'Wallet-signature authentication is required outside development.',
      );
    }
    if (!walletAddress) {
      throw new UnauthorizedException(
        'x-wallet-address header is required for development testing.',
      );
    }
    return walletAddress;
  }
}
