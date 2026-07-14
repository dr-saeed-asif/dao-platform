import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateProposalUseCase,
  GetProposalUseCase,
  ListProposalsUseCase,
  ProposalRepository,
} from '@dao-platform/application';
import { CyberChainGovernanceGateway } from '@dao-platform/blockchain-cyberchain';
import {
  SqliteDatabase,
  SqliteProposalRepository,
} from '@dao-platform/database';
import { ConfiguredOwnerAuthorization } from './configured-owner.authorization';
import { DatabaseLifecycleService } from './database-lifecycle.service';
import { ProposalsController } from './proposals.controller';
import { PROPOSAL_REPOSITORY, SQLITE_DATABASE } from './proposals.tokens';

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
      provide: CreateProposalUseCase,
      inject: [PROPOSAL_REPOSITORY, SQLITE_DATABASE, ConfigService],
      useFactory: (
        proposals: ProposalRepository,
        database: SqliteDatabase,
        config: ConfigService,
      ) =>
        new CreateProposalUseCase({
          proposals,
          transactionManager: database,
          authorization: new ConfiguredOwnerAuthorization(
            config.getOrThrow<string>('DAO_ADMIN_ADDRESS'),
          ),
          chainGateway: new CyberChainGovernanceGateway({
            rpcURL: config.getOrThrow<string>('CYBERCHAIN_RPC_URL'),
            chainId: config.getOrThrow<string>('CYBERCHAIN_CHAIN_ID'),
            contractAddress: config.getOrThrow<string>(
              'GOVERNANCE_CONTRACT_ADDRESS',
            ),
          }),
          idGenerator: { next: randomUUID },
          clock: { now: () => new Date() },
        }),
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
  ],
})
export class ProposalsModule {}
