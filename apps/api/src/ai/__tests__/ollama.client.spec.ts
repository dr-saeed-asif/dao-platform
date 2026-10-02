import { ConfigService } from '@nestjs/config';
import { OllamaClient } from '../ollama.client';

jest.mock('@nestjs/config');

describe('OllamaClient', () => {
  let client: OllamaClient;
  let mockConfig: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfig = {
      getOrThrow: jest.fn(),
      get: jest.fn(),
    } as any;

    mockConfig.getOrThrow.mockImplementation((key: string) => {
      const values: Record<string, string | number> = {
        OLLAMA_BASE_URL: 'http://localhost:11434',
        OLLAMA_CHAT_MODEL: 'qwen3.5:4b',
        OLLAMA_EMBED_MODEL: 'qwen3-embedding:0.6b',
        OLLAMA_EMBED_DIMENSION: 1024,
      };
      if (key in values) return values[key];
      throw new Error(`Missing config: ${key}`);
    });

    client = new OllamaClient(mockConfig);
  });

  describe('getters', () => {
    it('should return chat model', () => {
      expect(client.getChatModel()).toBe('qwen3.5:4b');
    });

    it('should return embed model', () => {
      expect(client.getEmbedModel()).toBe('qwen3-embedding:0.6b');
    });

    it('should return embed dimension', () => {
      expect(client.getEmbedDimension()).toBe(1024);
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('embed', () => {
    it('should validate embedding dimension', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[1, 2, 3]] }),
      });

      await expect(client.embed('test')).rejects.toThrow('Invalid embedding dimension');
    });
  });
});