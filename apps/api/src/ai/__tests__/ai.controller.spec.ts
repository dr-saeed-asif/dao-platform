import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from '../ai.controller';
import { OllamaClient, OllamaHealthResponse, OllamaChatResponse, OllamaEmbeddingResponse } from '../ollama.client';
import { LlmOnlySystem } from '../llm-only.system';
import { VectorRagSystem } from '../vector-rag.system';
import { VectorSearchService, SearchResult } from '../vector-search.service';
import { PostgresService } from '../../database/postgres.service';

describe('AiController', () => {
  let controller: AiController;
  let mockOllama: jest.Mocked<OllamaClient>;
  let mockLlmOnly: jest.Mocked<LlmOnlySystem>;
  let mockVectorRag: jest.Mocked<VectorRagSystem>;
  let mockVectorSearch: jest.Mocked<VectorSearchService>;
  let mockPostgres: jest.Mocked<PostgresService>;
  let mockDb: any;

  beforeEach(async () => {
    mockOllama = {
      healthCheck: jest.fn(),
      chat: jest.fn(),
      embed: jest.fn(),
      getChatModel: jest.fn().mockReturnValue('qwen3.5:4b'),
      getEmbedModel: jest.fn().mockReturnValue('qwen3-embedding:0.6b'),
      getEmbedDimension: jest.fn().mockReturnValue(1024),
    } as any;

    mockLlmOnly = {
      answer: jest.fn(),
    } as any;

    mockVectorRag = {
      answer: jest.fn(),
    } as any;

    mockVectorSearch = {
      search: jest.fn(),
    } as any;

    mockDb = {
      transaction: jest.fn().mockReturnValue({
        execute: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            insertInto: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            returning: jest.fn().mockReturnThis(),
            executeTakeFirstOrThrow: jest.fn().mockResolvedValue({ id: 1 }),
            selectFrom: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            executeTakeFirst: jest.fn().mockResolvedValue(null),
          };
          return cb(tx);
        }),
      }),
    };

    mockPostgres = {
      database: mockDb,
      checkConnection: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: OllamaClient, useValue: mockOllama },
        { provide: LlmOnlySystem, useValue: mockLlmOnly },
        { provide: VectorRagSystem, useValue: mockVectorRag },
        { provide: VectorSearchService, useValue: mockVectorSearch },
        { provide: PostgresService, useValue: mockPostgres },
      ],
    }).compile();

    controller = module.get<AiController>(AiController);
  });

  describe('health', () => {
    it('should return healthy status', async () => {
      mockOllama.healthCheck.mockResolvedValue({
        status: 'healthy',
        latencyMs: 50,
        model: 'qwen3.5:4b',
      } as OllamaHealthResponse);

      const result = await controller.health();

      expect(result.status).toBe('ok');
      expect(result.ollama.status).toBe('healthy');
      expect(result.postgres).toBe('ok');
    });

    it('should return degraded when ollama unhealthy', async () => {
      mockOllama.healthCheck.mockResolvedValue({
        status: 'unhealthy',
        latencyMs: 50,
        error: 'Connection refused',
      } as OllamaHealthResponse);

      const result = await controller.health();

      expect(result.status).toBe('degraded');
      expect(result.ollama.status).toBe('unhealthy');
    });
  });

  describe('query', () => {
    it('should handle llm-only query', async () => {
      mockLlmOnly.answer.mockResolvedValue({
        answer: 'LLM answer',
        latencyMs: 100,
        inputTokens: 10,
        outputTokens: 20,
      });

      const result = await controller.query({
        question: 'Test question',
        system: 'llm-only',
        topK: 5,
      });

      expect(result.system).toBe('llm-only');
      expect(result.answer).toBe('LLM answer');
      expect(result.evidence).toEqual([]);
      expect(result.retrieval).toEqual([]);
    });

    it('should handle vector-rag query', async () => {
      const mockSearchResults: SearchResult[] = [
        {
          rank: 1,
          score: 0.9,
          chunkEvidenceId: 'chunk:1',
          artefactEvidenceId: 'artefact:1',
          proposalId: 'prop-1',
          filename: 'doc.pdf',
          content: 'Content',
          metadata: {},
        },
      ];
      mockVectorSearch.search.mockResolvedValue(mockSearchResults);

      mockVectorRag.answer.mockResolvedValue({
        answer: 'RAG answer',
        evidence: mockSearchResults,
        latencyMs: 300,
        retrievalLatencyMs: 100,
        generationLatencyMs: 200,
        inputTokens: 50,
        outputTokens: 30,
      });

      const result = await controller.query({
        question: 'Test question',
        system: 'vector-rag',
        proposalId: 'prop-1',
        topK: 5,
      });

      expect(result.system).toBe('vector-rag');
      expect(result.answer).toBe('RAG answer');
      expect(result.evidence).toHaveLength(1);
      expect(result.retrieval).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      mockLlmOnly.answer.mockRejectedValue(new Error('Ollama error'));

      const result = await controller.query({
        question: 'Test question',
        system: 'llm-only',
      });

      expect(result.error).toBe('Ollama error');
      expect(result.answer).toBe('');
    });
  });
});