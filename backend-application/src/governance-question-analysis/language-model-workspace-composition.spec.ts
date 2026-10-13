import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiModule } from './governance-question-analysis.module';
import { PostgresService } from '../infrastructure-connections/database/postgresql-connection.service';
import { GOVERNANCE_GATEWAY } from '../governance-proposal-management/governance-dependency-tokens';
import { VectorSearchService } from '../trusted-governance-data-tools/document-evidence-search/search-document-evidence.service';
import { OllamaClient, MultiAgentSystem, ToolRegistry, VectorRagSystem, DOCUMENT_EVIDENCE_SEARCH } from '@dao-platform/language-models';

describe('Language-model workspace dependency composition', () => {
  it('binds the extracted model classes to the existing backend retrieval service', async () => {
    const values: Record<string, unknown> = {
      CYBERCHAIN_CHAIN_ID: '1212',
      GOVERNANCE_CONTRACT_ADDRESS: `0x${'11'.repeat(20)}`,
      DAO_ADMIN_ADDRESS: `0x${'22'.repeat(20)}`,
      OLLAMA_BASE_URL: 'http://localhost:11434',
      OLLAMA_LLM_MODEL: 'migration-test-model',
      OLLAMA_EMBED_MODEL: 'migration-test-embedding',
      OLLAMA_EMBED_DIMENSION: 1024,
      GOVERNANCE_DEPLOYMENT_BLOCK: 0,
      VOTE_INDEXER_BLOCK_RANGE: 1000,
    };
    const configuration = {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
      getOrThrow: (key: string) => {
        if (!(key in values)) throw new Error(`Missing test configuration: ${key}`);
        return values[key];
      },
    };
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, skipProcessEnv: true }), AiModule] })
      .overrideProvider(ConfigService).useValue(configuration)
      .overrideProvider(PostgresService).useValue({ database: {}, initialize: async () => {} })
      .overrideProvider(GOVERNANCE_GATEWAY).useValue({})
      .compile();
    try {
      expect(module.get(DOCUMENT_EVIDENCE_SEARCH)).toBe(module.get(VectorSearchService));
      expect(module.get(VectorRagSystem)).toBeInstanceOf(VectorRagSystem);
      expect(module.get(MultiAgentSystem)).toBeInstanceOf(MultiAgentSystem);
      expect(module.get(ToolRegistry)).toBeInstanceOf(ToolRegistry);
      expect(module.get(OllamaClient)).toBeInstanceOf(OllamaClient);
    } finally {
      await module.close();
    }
  });
});
