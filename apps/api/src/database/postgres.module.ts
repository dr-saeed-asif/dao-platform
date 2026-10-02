import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresGovernanceEventRepository } from '@dao-platform/database';
import { GOVERNANCE_EVENT_REPOSITORY } from './database.tokens';
import { PostgresService } from './postgres.service';

@Module({
  imports: [ConfigModule],
  providers: [
    PostgresService,
    {
      provide: GOVERNANCE_EVENT_REPOSITORY,
      inject: [PostgresService],
      async useFactory(service: PostgresService) {
        await service.initialize();
        return new PostgresGovernanceEventRepository(service.database);
      },
    },
  ],
  exports: [PostgresService, GOVERNANCE_EVENT_REPOSITORY],
})
export class PostgresModule {}
