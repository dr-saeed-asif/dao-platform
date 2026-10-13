import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { envValidationSchema } from './environment-configuration/environment-variables.validation';

import { HealthModule } from './service-health-monitoring/service-health.module';

import { ProposalsModule } from './governance-proposal-management/governance-proposal-management.module';

import { PostgresModule } from './infrastructure-connections/database/postgresql-connection.module';

import { ResearchModule } from './research-documents-and-datasets/research-documents-and-datasets.module';

import { AiModule } from './governance-question-analysis/governance-question-analysis.module';



@Module({

  imports: [

    ConfigModule.forRoot({

      isGlobal: true,

      envFilePath: ['../.env', '.env'],

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

