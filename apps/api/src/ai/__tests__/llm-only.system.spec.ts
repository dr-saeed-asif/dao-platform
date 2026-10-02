import { LlmOnlySystem } from '../llm-only.system';
import { OllamaClient, OllamaChatResponse } from '../ollama.client';

describe('LlmOnlySystem', () => {
  let system: LlmOnlySystem;
  let mockOllama: jest.Mocked<OllamaClient>;

  beforeEach(() => {
    mockOllama = {
      chat: jest.fn(),
      getChatModel: jest.fn().mockReturnValue('qwen3.5:4b'),
      getEmbedModel: jest.fn().mockReturnValue('qwen3-embedding:0.6b'),
      getEmbedDimension: jest.fn().mockReturnValue(1024),
    } as any;

    system = new LlmOnlySystem(mockOllama);
  });

  describe('answer', () => {
    it('should call ollama chat with correct messages', async () => {
      const mockResponse: OllamaChatResponse = {
        content: 'Test answer',
        latencyMs: 100,
        inputTokens: 10,
        outputTokens: 20,
      };
      mockOllama.chat.mockResolvedValue(mockResponse);

      const result = await system.answer('Test question');

      expect(result.answer).toBe('Test answer');
      expect(result.latencyMs).toBe(100);
      expect(mockOllama.chat).toHaveBeenCalledWith([
        { role: 'system', content: expect.any(String) },
        { role: 'user', content: 'Test question' },
      ]);
    });
  });
});