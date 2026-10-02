import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssignmentRepository,
  AssignMembersUseCase,
  CancelProposalUseCase,
  ClearGovernanceDataUseCase,
  ChainTransactionRepository,
  ConfirmVoteUseCase,
  CreateProposalUseCase,
  GetProposalUseCase,
  FinalizeProposalUseCase,
  GovernanceChainGateway,
  GovernanceEventRepository,
  ListMembersUseCase,
  ListProposalsUseCase,
  ListTransactionsUseCase,
  ListVotesUseCase,
  PrepareVoteUseCase,
  PublishProposalUseCase,
  ProposalRepository,
  SyncStateRepository,
  SyncGovernanceUseCase,
  SyncVotesUseCase,
  UnassignMemberUseCase,
  VoteRepository,
} from '@dao-platform/application';
import { CyberChainGovernanceGateway } from '@dao-platform/blockchain-cyberchain';
import {
  PostgresOperationalDatabase,
  PostgresProposalRepository,
  PostgresAssignmentRepository,
  PostgresChainTransactionRepository,
  PostgresVoteRepository,
  PostgresSyncStateRepository,
} from '@dao-platform/database';
import { PostgresService } from '../database/postgres.service';
import { ConfiguredOwnerAuthorization } from './configured-owner.authorization';
import { GOVERNANCE_EVENT_REPOSITORY } from '../database/database.tokens';
import { PostgresModule } from '../database/postgres.module';
import { ResearchModule } from '../research/research.module';
import { ProposalsController } from './proposals.controller';
import { VotingIndexerService } from './voting-indexer.service';
import {
  ASSIGNMENT_REPOSITORY,
  CHAIN_TRANSACTION_REPOSITORY,
  GOVERNANCE_GATEWAY,
  PROPOSAL_REPOSITORY,
  OPERATIONAL_DATABASE,
  SYNC_STATE_REPOSITORY,
  VOTE_REPOSITORY,
} from './proposals.tokens';

@Module({
  imports: [PostgresModule, ResearchModule],
  controllers: [ProposalsController],
  providers: [
    {
      provide: OPERATIONAL_DATABASE,
      inject: [PostgresService],
      async useFactory(postgres: PostgresService): Promise<PostgresOperationalDatabase> {
        await postgres.initialize();
        if (!postgres.database) throw new Error('POSTGRES_URL is required.');
        return new PostgresOperationalDatabase(postgres.database);
      },
    },
    {
      provide: PROPOSAL_REPOSITORY,
      inject: [OPERATIONAL_DATABASE, ConfigService],
      useFactory: (database: PostgresOperationalDatabase, config: ConfigService) =>
        new PostgresProposalRepository(database, config.getOrThrow<string>('CYBERCHAIN_CHAIN_ID'), config.getOrThrow<string>('GOVERNANCE_CONTRACT_ADDRESS')),
    },
    {
      provide: ASSIGNMENT_REPOSITORY,
      inject: [OPERATIONAL_DATABASE],
      useFactory: (database: PostgresOperationalDatabase) => new PostgresAssignmentRepository(database),
    },
    {
      provide: CHAIN_TRANSACTION_REPOSITORY,
      inject: [OPERATIONAL_DATABASE, ConfigService],
      useFactory: (database: PostgresOperationalDatabase, config: ConfigService) =>
        new PostgresChainTransactionRepository(database, config.getOrThrow<string>('CYBERCHAIN_CHAIN_ID'), config.getOrThrow<string>('GOVERNANCE_CONTRACT_ADDRESS')),
    },
    {
      provide: VOTE_REPOSITORY,
      inject: [OPERATIONAL_DATABASE],
      useFactory: (database: PostgresOperationalDatabase) => new PostgresVoteRepository(database),
    },
    {
      provide: SYNC_STATE_REPOSITORY,
      inject: [OPERATIONAL_DATABASE, ConfigService],
      useFactory: (database: PostgresOperationalDatabase, config: ConfigService) =>
        new PostgresSyncStateRepository(database, config.getOrThrow<string>('CYBERCHAIN_CHAIN_ID'), config.getOrThrow<string>('GOVERNANCE_CONTRACT_ADDRESS'), 'v1'),
    },
    {
      provide: GOVERNANCE_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): GovernanceChainGateway =>
        new CyberChainGovernanceGateway({
          rpcURL: config.getOrThrow<string>('CYBERCHAIN_RPC_URL'),
          chainId: config.getOrThrow<string>('CYBERCHAIN_CHAIN_ID'),
          contractAddress: config.getOrThrow<string>(
            'GOVERNANCE_CONTRACT_ADDRESS',
          ),
          signing: {
            signMode: config.getOrThrow<'ec-dsa' | 'ml-dsa'>('SIGN_MODE'),
            ecdsaPrivateKey: config.getOrThrow<string>('ECDSA_PRIVATE_KEY'),
            mldsaPublicKey: config.getOrThrow<string>('MLDSA_PUBLIC_KEY'),
            mldsaSecretKey: config.get<string>('MLDSA_SECRET_KEY'),
            mldsaLevel: config.getOrThrow<44 | 65 | 87>('MLDSA_LEVEL'),
          },
        }),
    },
    {
      provide: CreateProposalUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        OPERATIONAL_DATABASE,
        ConfigService,
        GOVERNANCE_GATEWAY,
      ],
      useFactory: (
        proposals: ProposalRepository,
        database: PostgresOperationalDatabase,
        config: ConfigService,
        chainGateway: GovernanceChainGateway,
      ) =>
        new CreateProposalUseCase({
          proposals,
          transactionManager: database,
          authorization: new ConfiguredOwnerAuthorization(
            config.getOrThrow<string>('DAO_ADMIN_ADDRESS'),
          ),
          chainGateway,
          idGenerator: { next: randomUUID },
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: PublishProposalUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        GOVERNANCE_GATEWAY,
        OPERATIONAL_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: PostgresOperationalDatabase,
        config: ConfigService,
      ) =>
        new PublishProposalUseCase(
          proposals,
          transactions,
          ownerAuthorization(config),
          chain,
          database,
          { now: () => new Date() },
        ),
    },
    {
      provide: AssignMembersUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        ASSIGNMENT_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        GOVERNANCE_GATEWAY,
        OPERATIONAL_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        assignments: AssignmentRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: PostgresOperationalDatabase,
        config: ConfigService,
      ) =>
        new AssignMembersUseCase(
          proposals,
          assignments,
          transactions,
          ownerAuthorization(config),
          chain,
          database,
          { now: () => new Date() },
        ),
    },
    {
      provide: UnassignMemberUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        ASSIGNMENT_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        GOVERNANCE_GATEWAY,
        OPERATIONAL_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        assignments: AssignmentRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: PostgresOperationalDatabase,
        config: ConfigService,
      ) =>
        new UnassignMemberUseCase(
          proposals,
          assignments,
          transactions,
          ownerAuthorization(config),
          chain,
          database,
          { now: () => new Date() },
        ),
    },
    {
      provide: ListMembersUseCase,
      inject: [ASSIGNMENT_REPOSITORY],
      useFactory: (assignments: AssignmentRepository) =>
        new ListMembersUseCase(assignments),
    },
    {
      provide: PrepareVoteUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        ASSIGNMENT_REPOSITORY,
        VOTE_REPOSITORY,
        GOVERNANCE_GATEWAY,
      ],
      useFactory: (
        proposals: ProposalRepository,
        assignments: AssignmentRepository,
        votes: VoteRepository,
        chain: GovernanceChainGateway,
      ) => new PrepareVoteUseCase(proposals, assignments, votes, chain),
    },
    {
      provide: ConfirmVoteUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        VOTE_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        GOVERNANCE_GATEWAY,
        OPERATIONAL_DATABASE,
      ],
      useFactory: (
        proposals: ProposalRepository,
        votes: VoteRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: PostgresOperationalDatabase,
      ) =>
        new ConfirmVoteUseCase(proposals, votes, transactions, chain, database),
    },
    {
      provide: ListVotesUseCase,
      inject: [VOTE_REPOSITORY],
      useFactory: (votes: VoteRepository) => new ListVotesUseCase(votes),
    },
    {
      provide: ListTransactionsUseCase,
      inject: [CHAIN_TRANSACTION_REPOSITORY],
      useFactory: (transactions: ChainTransactionRepository) =>
        new ListTransactionsUseCase(transactions),
    },
    {
      provide: CancelProposalUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        GOVERNANCE_GATEWAY,
        OPERATIONAL_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: PostgresOperationalDatabase,
        config: ConfigService,
      ) =>
        new CancelProposalUseCase(
          proposals,
          transactions,
          ownerAuthorization(config),
          chain,
          database,
        ),
    },
    {
      provide: FinalizeProposalUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        GOVERNANCE_GATEWAY,
        OPERATIONAL_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: PostgresOperationalDatabase,
        config: ConfigService,
      ) =>
        new FinalizeProposalUseCase(
          proposals,
          transactions,
          ownerAuthorization(config),
          chain,
          database,
        ),
    },
    {
      provide: SyncVotesUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        VOTE_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        SYNC_STATE_REPOSITORY,
        GOVERNANCE_GATEWAY,
        OPERATIONAL_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        votes: VoteRepository,
        transactions: ChainTransactionRepository,
        state: SyncStateRepository,
        chain: GovernanceChainGateway,
        database: PostgresOperationalDatabase,
        config: ConfigService,
      ) =>
        new SyncVotesUseCase(
          proposals,
          votes,
          transactions,
          state,
          chain,
          database,
          BigInt(config.getOrThrow<number>('GOVERNANCE_DEPLOYMENT_BLOCK')),
          BigInt(config.getOrThrow<number>('VOTE_INDEXER_BLOCK_RANGE')),
        ),
    },
    {
      provide: SyncGovernanceUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        ASSIGNMENT_REPOSITORY,
        VOTE_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        SYNC_STATE_REPOSITORY,
        GOVERNANCE_GATEWAY,
        GOVERNANCE_EVENT_REPOSITORY,
        OPERATIONAL_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        assignments: AssignmentRepository,
        votes: VoteRepository,
        transactions: ChainTransactionRepository,
        state: SyncStateRepository,
        chain: GovernanceChainGateway,
        governanceEvents: GovernanceEventRepository,
        database: PostgresOperationalDatabase,
        config: ConfigService,
      ) =>
        new SyncGovernanceUseCase(
          proposals,
          assignments,
          votes,
          transactions,
          state,
          chain,
          governanceEvents,
          database,
          BigInt(
            config.getOrThrow<number>('GOVERNANCE_DEPLOYMENT_BLOCK'),
          ),
          BigInt(config.getOrThrow<number>('VOTE_INDEXER_BLOCK_RANGE')),
        ),
    },
    {
      provide: ClearGovernanceDataUseCase,
      inject: [OPERATIONAL_DATABASE, SYNC_STATE_REPOSITORY, GOVERNANCE_GATEWAY],
      useFactory: (
        database: PostgresOperationalDatabase,
        state: SyncStateRepository,
        chain: GovernanceChainGateway,
      ) => new ClearGovernanceDataUseCase(database, state, chain),
    },
    {
      provide: GetProposalUseCase,
      inject: [PROPOSAL_REPOSITORY],
      useFactory: (proposals: ProposalRepository) =>
        new GetProposalUseCase(proposals),
    },
    {
      provide: ListProposalsUseCase,
      inject: [PROPOSAL_REPOSITORY],
      useFactory: (proposals: ProposalRepository) =>
        new ListProposalsUseCase(proposals),
    },
    VotingIndexerService,
  ],
})
export class ProposalsModule {}

function ownerAuthorization(config: ConfigService) {
  return new ConfiguredOwnerAuthorization(
    config.getOrThrow<string>('DAO_ADMIN_ADDRESS'),
  );
}
