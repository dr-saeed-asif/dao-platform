import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  AssignMembersUseCase,
  CancelProposalUseCase,
  ConfirmVoteUseCase,
  CreateProposalUseCase,
  GetProposalUseCase,
  FinalizeProposalUseCase,
  ListMembersUseCase,
  ListVotesUseCase,
  ListProposalsUseCase,
  ListTransactionsUseCase,
  PublishProposalUseCase,
  PrepareVoteUseCase,
  SyncVotesUseCase,
  SyncGovernanceUseCase,
  UnassignMemberUseCase,
} from '@dao-platform/application';
import { AssignMembersDto } from './assign-members.dto';
import { ConfirmVoteDto } from './confirm-vote.dto';
import { CreateProposalDto } from './create-proposal.dto';
import { PrepareVoteDto } from './prepare-vote.dto';
import { SyncVotesDto } from './sync-votes.dto';

@Controller('proposals')
export class ProposalsController {
  constructor(
    private readonly createProposal: CreateProposalUseCase,
    private readonly getProposal: GetProposalUseCase,
    private readonly listProposals: ListProposalsUseCase,
    private readonly publishProposal: PublishProposalUseCase,
    private readonly assignMembers: AssignMembersUseCase,
    private readonly unassignMember: UnassignMemberUseCase,
    private readonly listMembers: ListMembersUseCase,
    private readonly prepareVote: PrepareVoteUseCase,
    private readonly confirmVote: ConfirmVoteUseCase,
    private readonly listVotes: ListVotesUseCase,
    private readonly listTransactions: ListTransactionsUseCase,
    private readonly cancelProposal: CancelProposalUseCase,
    private readonly finalizeProposal: FinalizeProposalUseCase,
    private readonly syncVotes: SyncVotesUseCase,
    private readonly syncGovernance: SyncGovernanceUseCase,
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

  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    return this.publishProposal.execute(
      id,
      this.developmentActor(walletAddress),
    );
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    return this.cancelProposal.execute(
      id,
      this.developmentActor(walletAddress),
    );
  }

  @Post(':id/finalize')
  finalize(
    @Param('id') id: string,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    return this.finalizeProposal.execute(
      id,
      this.developmentActor(walletAddress),
    );
  }

  @Post(':id/members')
  assign(
    @Param('id') id: string,
    @Body() body: AssignMembersDto,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    return this.assignMembers.execute(
      id,
      this.developmentActor(walletAddress),
      body.memberAddresses,
    );
  }

  @Get(':id/members')
  members(@Param('id') id: string) {
    return this.listMembers.execute(id);
  }

  @Delete(':id/members/:walletAddress')
  unassign(
    @Param('id') id: string,
    @Param('walletAddress') memberAddress: string,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    return this.unassignMember.execute(
      id,
      this.developmentActor(walletAddress),
      memberAddress,
    );
  }

  @Post(':id/votes/prepare')
  prepareMemberVote(
    @Param('id') id: string,
    @Body() body: PrepareVoteDto,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    return this.prepareVote.execute(
      id,
      this.developmentActor(walletAddress),
      body.optionIndex,
    );
  }

  @Post(':id/votes/confirm')
  confirmMemberVote(
    @Param('id') id: string,
    @Body() body: ConfirmVoteDto,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    return this.confirmVote.execute(
      id,
      this.developmentActor(walletAddress),
      body.transactionHash,
    );
  }

  @Get(':id/votes')
  votes(@Param('id') id: string) {
    return this.listVotes.execute(id);
  }

  @Get(':id/transactions')
  transactions(@Param('id') id: string) {
    return this.listTransactions.execute(id);
  }

  @Post('sync/votes')
  synchronizeVotes(
    @Body() body: SyncVotesDto,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    this.developmentAdmin(walletAddress);
    return this.syncVotes.execute(body.full ?? false);
  }

  @Post('sync/governance')
  synchronizeGovernance(
    @Body() body: SyncVotesDto,
    @Headers('x-wallet-address') walletAddress?: string,
  ) {
    this.developmentAdmin(walletAddress);
    return this.syncGovernance.execute(body.full ?? false);
  }

  private developmentAdmin(walletAddress?: string): string {
    const actor = this.developmentActor(walletAddress);
    const admin = this.config.getOrThrow<string>('DAO_ADMIN_ADDRESS');
    if (actor.toLowerCase() !== admin.toLowerCase()) {
      throw new UnauthorizedException('DAO administrator wallet is required.');
    }
    return actor;
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
