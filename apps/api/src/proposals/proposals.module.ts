import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssignmentRepository,
  AssignMembersUseCase,
  ChainTransactionRepository,
  ConfirmVoteUseCase,
  CreateProposalUseCase,
  GetProposalUseCase,
  GovernanceChainGateway,
  ListMembersUseCase,
  ListProposalsUseCase,
  ListVotesUseCase,
  PrepareVoteUseCase,
  PublishProposalUseCase,
  ProposalRepository,
  SyncStateRepository,
  SyncVotesUseCase,
  UnassignMemberUseCase,
  VoteRepository,
} from '@dao-platform/application';
import { CyberChainGovernanceGateway } from '@dao-platform/blockchain-cyberchain';
import {
  SqliteDatabase,
  SqliteAssignmentRepository,
  SqliteChainTransactionRepository,
  SqliteProposalRepository,
  SqliteSyncStateRepository,
  SqliteVoteRepository,
} from '@dao-platform/database';
import { ConfiguredOwnerAuthorization } from './configured-owner.authorization';
import { DatabaseLifecycleService } from './database-lifecycle.service';
import { ProposalsController } from './proposals.controller';
import { VotingIndexerService } from './voting-indexer.service';
import {
  ASSIGNMENT_REPOSITORY,
  CHAIN_TRANSACTION_REPOSITORY,
  GOVERNANCE_GATEWAY,
  PROPOSAL_REPOSITORY,
  SQLITE_DATABASE,
  SYNC_STATE_REPOSITORY,
  VOTE_REPOSITORY,
} from './proposals.tokens';

@Module({
  controllers: [ProposalsController],
  providers: [
    {
      provide: SQLITE_DATABASE,
      inject: [ConfigService],
      async useFactory(config: ConfigService): Promise<SqliteDatabase> {
        const repositoryRoot = resolve(process.cwd(), '../..');
        const database = new SqliteDatabase(
          config.getOrThrow<string>('DATABASE_URL'),
          repositoryRoot,
        );
        await database.migrateToLatest();
        return database;
      },
    },
    {
      provide: PROPOSAL_REPOSITORY,
      inject: [SQLITE_DATABASE],
      useFactory: (database: SqliteDatabase) =>
        new SqliteProposalRepository(database),
    },
    {
      provide: ASSIGNMENT_REPOSITORY,
      inject: [SQLITE_DATABASE],
      useFactory: (database: SqliteDatabase) =>
        new SqliteAssignmentRepository(database),
    },
    {
      provide: CHAIN_TRANSACTION_REPOSITORY,
      inject: [SQLITE_DATABASE],
      useFactory: (database: SqliteDatabase) =>
        new SqliteChainTransactionRepository(database),
    },
    {
      provide: VOTE_REPOSITORY,
      inject: [SQLITE_DATABASE],
      useFactory: (database: SqliteDatabase) =>
        new SqliteVoteRepository(database),
    },
    {
      provide: SYNC_STATE_REPOSITORY,
      inject: [SQLITE_DATABASE],
      useFactory: (database: SqliteDatabase) =>
        new SqliteSyncStateRepository(database),
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
        SQLITE_DATABASE,
        ConfigService,
        GOVERNANCE_GATEWAY,
      ],
      useFactory: (
        proposals: ProposalRepository,
        database: SqliteDatabase,
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
        SQLITE_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: SqliteDatabase,
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
        SQLITE_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        assignments: AssignmentRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: SqliteDatabase,
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
        SQLITE_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        assignments: AssignmentRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: SqliteDatabase,
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
        SQLITE_DATABASE,
      ],
      useFactory: (
        proposals: ProposalRepository,
        votes: VoteRepository,
        transactions: ChainTransactionRepository,
        chain: GovernanceChainGateway,
        database: SqliteDatabase,
      ) =>
        new ConfirmVoteUseCase(proposals, votes, transactions, chain, database),
    },
    {
      provide: ListVotesUseCase,
      inject: [VOTE_REPOSITORY],
      useFactory: (votes: VoteRepository) => new ListVotesUseCase(votes),
    },
    {
      provide: SyncVotesUseCase,
      inject: [
        PROPOSAL_REPOSITORY,
        VOTE_REPOSITORY,
        CHAIN_TRANSACTION_REPOSITORY,
        SYNC_STATE_REPOSITORY,
        GOVERNANCE_GATEWAY,
        SQLITE_DATABASE,
        ConfigService,
      ],
      useFactory: (
        proposals: ProposalRepository,
        votes: VoteRepository,
        transactions: ChainTransactionRepository,
        state: SyncStateRepository,
        chain: GovernanceChainGateway,
        database: SqliteDatabase,
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
    DatabaseLifecycleService,
    VotingIndexerService,
  ],
})
export class ProposalsModule {}

function ownerAuthorization(config: ConfigService) {
  return new ConfiguredOwnerAuthorization(
    config.getOrThrow<string>('DAO_ADMIN_ADDRESS'),
  );
}
