import { Module } from '@nestjs/common';
import { HealthController } from './service-health.controller';
import { PostgresModule } from '../infrastructure-connections/database/postgresql-connection.module';

@Module({
  imports: [PostgresModule],
  controllers: [HealthController],
})
export class HealthModule {}
