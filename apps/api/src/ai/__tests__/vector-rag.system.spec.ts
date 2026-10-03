import { VectorRagSystem } from '../vector-rag.system';
import { VectorSearchService, SearchResult } from '../vector-search.service';
import { OllamaClient, OllamaChatResponse } from '../ollama.client';

describe('VectorRagSystem', () => {
  let system: VectorRagSystem;
  let mockVectorSearch: jest.Mocked<VectorSearchService>;
  let mockOllama: jest.Mocked<OllamaClient>;

  beforeEach(() => {
    mockVectorSearch = {
      search: jest.fn(),
    } as any;

    mockOllama = {
      chat: jest.fn(),
      getChatModel: jest.fn().mockReturnValue('qwen3.5:4b'),
      getEmbedModel: jest.fn().mockReturnValue('qwen3-embedding:0.6b'),
      getEmbedDimension: jest.fn().mockReturnValue(1024),
    } as any;

    system = new VectorRagSystem(mockVectorSearch, mockOllama);
  });

  describe('answer', () => {
    it('should return insufficient evidence when no results', async () => {
      mockVectorSearch.search.mockResolvedValue([]);

      const result = await system.answer('Test question');

      expect(result.answer).toBe('No indexed document evidence was found for this proposal.');
      expect(result.evidence).toEqual([]);
      expect(result.retrievalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.generationLatencyMs).toBe(0);
    });

    it('should use retrieved context for answer', async () => {
      const mockResults: SearchResult[] = [
        {
          rank: 1,
          score: 0.9,
          chunkEvidenceId: 'chunk:1',
          artefactEvidenceId: 'artefact:1',
          proposalId: 'prop-1',
          filename: 'doc.pdf',
          content: 'Relevant content from document',
          metadata: {},
        },
      ];
      mockVectorSearch.search.mockResolvedValue(mockResults);

      const mockChatResponse: OllamaChatResponse = {
        content: 'Answer based on context',
        latencyMs: 200,
        inputTokens: 50,
        outputTokens: 30,
      };
      mockOllama.chat.mockResolvedValue(mockChatResponse);

      const result = await system.answer('Test question', 'prop-1', 5);

      expect(result.answer).toBe('Answer based on context');
      expect(result.evidence).toEqual(mockResults);
      expect(result.retrievalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.generationLatencyMs).toBeGreaterThanOrEqual(0);
      expect(mockVectorSearch.search).toHaveBeenCalledWith('Test question', { proposalId: 'prop-1', topK: 5 });
      expect(mockOllama.chat).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user', content: expect.stringContaining('Relevant content') }),
      ]));
    });
  });
});
