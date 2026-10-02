import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { ProposalsModule } from './proposals/proposals.module';
import { PostgresModule } from './database/postgres.module';
import { ResearchModule } from './research/research.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    HealthModule,
    PostgresModule,
    ResearchModule,
    ProposalsModule,
    AiModule,
  ],
})
export class AppModule {}
