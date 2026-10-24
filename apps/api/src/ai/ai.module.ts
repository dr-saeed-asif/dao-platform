import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresModule } from '../database/postgres.module';
import { ResearchModule } from '../research/research.module';
import { AiController } from './ai.controller';
import { AssistantController } from './assistant.controller';
import { AssistantAuthService } from './assistant-auth.service';
import { BlockchainVerificationService } from './blockchain-verification.service';
import { BlockchainVerificationController } from './blockchain-verification.controller';

@Module({
  imports: [ConfigModule, PostgresModule, ResearchModule],
  controllers: [AiController, AssistantController, BlockchainVerificationController],
  providers: [AssistantAuthService, BlockchainVerificationService],
})
export class AiModule {}
