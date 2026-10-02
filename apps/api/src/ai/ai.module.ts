import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresModule } from '../database/postgres.module';
import { ResearchModule } from '../research/research.module';
import { TextExtractionService } from './text-extraction.service';
import { ChunkingService } from './chunking.service';
import { OllamaClient } from './ollama.client';
import { EmbeddingPipelineService } from './embedding-pipeline.service';
import { VectorSearchService } from './vector-search.service';
import { LlmOnlySystem } from './llm-only.system';
import { VectorRagSystem } from './vector-rag.system';
import { AiController } from './ai.controller';

@Module({
  imports: [ConfigModule, PostgresModule, ResearchModule],
  controllers: [AiController],
  providers: [
    TextExtractionService,
    ChunkingService,
    OllamaClient,
    EmbeddingPipelineService,
    VectorSearchService,
    LlmOnlySystem,
    VectorRagSystem,
  ],
  exports: [
    TextExtractionService,
    ChunkingService,
    OllamaClient,
    EmbeddingPipelineService,
    VectorSearchService,
    LlmOnlySystem,
    VectorRagSystem,
  ],
})
export class AiModule {}