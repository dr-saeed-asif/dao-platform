import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from '../ai.controller';
import { GeminiClient, GeminiHealthResponse, GeminiChatResponse, GeminiEmbeddingResponse } from '../gemini.client';
import { LlmOnlySystem } from '../llm-only.system';
import { VectorRagSystem } from '../vector-rag.system';
import { VectorSearchService, SearchResult } from '../vector-search.service';
import { PostgresService } from '../../database/postgres.service';
import { ResearchRunsService } from '../../research/research-runs.service';
import { MultiAgentSystem } from '../agents/multi-agent.system';

describe('AiController', () => {
  let controller: AiController;
  let mockOllama: jest.Mocked<GeminiClient>;
  let mockLlmOnly: jest.Mocked<LlmOnlySystem>;
  let mockVectorRag: jest.Mocked<VectorRagSystem>;
  let mockVectorSearch: jest.Mocked<VectorSearchService>;
  let mockPostgres: jest.Mocked<PostgresService>;
  let mockDb: any;
  let mockRuns: {record:jest.Mock};
  let mockMultiAgent: {execute:jest.Mock;executeHybrid:jest.Mock};

  beforeEach(async () => {
    mockOllama = {
      healthCheck: jest.fn(),
      chat: jest.fn(),
      embed: jest.fn(),
      getChatModel: jest.fn().mockReturnValue('qwen3:0.6b'),
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
      selectFrom: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn().mockResolvedValue({ id: 'prop-1', on_chain_id: '12', chain_id: '1212', contract_address: '0x51b43885899bd0301c2beea89addc9d876145d21' }),
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
    mockRuns={record:jest.fn().mockResolvedValue(undefined)};
    mockMultiAgent={execute:jest.fn(),executeHybrid:jest.fn()};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: GeminiClient, useValue: mockOllama },
        { provide: LlmOnlySystem, useValue: mockLlmOnly },
        { provide: VectorRagSystem, useValue: mockVectorRag },
        { provide: VectorSearchService, useValue: mockVectorSearch },
        { provide: PostgresService, useValue: mockPostgres },
        { provide: ResearchRunsService, useValue: mockRuns },
        { provide: MultiAgentSystem, useValue: mockMultiAgent },
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
      } as GeminiHealthResponse);

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
      } as GeminiHealthResponse);

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

    it.each([
      ['hybrid',false],
      ['hybrid-verified',true],
    ] as const)('runs and stores %s using the shared hybrid engine',async(system,verified)=>{
      const response={runId:`run-${system}`,system,answer:'answer',evidence:[],retrieval:[],claims:[],agentTrace:[],agentsUsed:[],toolsUsed:[],abstained:false,latencyMs:3,llmCalls:1,embeddingCalls:0,errors:[]};
      mockMultiAgent.executeHybrid.mockResolvedValue(response);
      const result=await controller.query({question:'How many votes did this proposal receive?',proposalId:'prop-1',system});
      expect(mockMultiAgent.executeHybrid).toHaveBeenCalledWith(expect.objectContaining({localProposalId:'prop-1',onChainProposalId:'12'}),verified);
      expect(mockRuns.record).toHaveBeenCalledWith(expect.anything(),expect.anything(),response);
      expect(result.system).toBe(system);
    });

    it('runs and stores the multi-agent system separately',async()=>{
      const response={runId:'run-multi',system:'multi-agent',answer:'answer',evidence:[],retrieval:[],claims:[],verification:{status:'SUPPORTED',claims:[],correctionRounds:0},agentTrace:[],agentsUsed:['coordinator','sql','verification'],toolsUsed:['getProposalVotes'],abstained:false,latencyMs:3,llmCalls:0,embeddingCalls:0,errors:[]};
      mockMultiAgent.execute.mockResolvedValue(response);
      const result=await controller.query({question:'How many votes did this proposal receive?',proposalId:'prop-1',system:'multi-agent'});
      expect(mockRuns.record).toHaveBeenCalledWith(expect.anything(),expect.anything(),response);
      expect(result.system).toBe('multi-agent');
    });
  });
});
