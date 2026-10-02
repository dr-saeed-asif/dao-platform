import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PostgresModule } from '../database/postgres.module';

@Module({
  imports: [PostgresModule],
  controllers: [HealthController],
})
export class HealthModule {}
