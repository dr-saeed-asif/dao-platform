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
        OLLAMA_CHAT_MODEL: 'qwen3:0.6b',
        OLLAMA_EMBED_MODEL: 'qwen3-embedding:0.6b',
        OLLAMA_EMBED_DIMENSION: 1024,
      };
      if (key in values) return values[key];
      throw new Error(`Missing config: ${key}`);
    });

    client = new OllamaClient(mockConfig);
  });

  describe('getters', () => {
    it('should select Ollama when IS_ACTIVE is missing', () => {
      expect(client.getProvider()).toBe('ollama');
      expect(client.getEmbeddingIdentity()).toBe('ollama:qwen3-embedding:0.6b');
    });

    it('should return chat model', () => {
      expect(client.getChatModel()).toBe('qwen3:0.6b');
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

  it('disables thinking and bounds chat generation',async()=>{
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({message:{content:'{}'}})});
    await client.chat([{role:'user',content:'test'}],{json:true});
    const body=JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.think).toBe(false);
    expect(body.options.num_predict).toBe(768);
  });

  it('uses Gemini for chat and embeddings only when IS_ACTIVE is true', async () => {
    mockConfig.get.mockImplementation((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        IS_ACTIVE: 'true',
      };
      return key in values ? values[key] : fallback;
    });
    mockConfig.getOrThrow.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        GEMINI_API_KEY: 'test-key',
        GEMINI_LLM_MODEL: 'gemini-test',
        GEMINI_EMBEDDING_MODEL: 'gemini-embedding-test',
      };
      if (key in values) return values[key];
      throw new Error(`Missing config: ${key}`);
    });
    client = new OllamaClient(mockConfig);
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(1024).fill(0.1) } }),
      });

    const chat = await client.chat([{ role: 'user', content: 'test' }], { json: true });
    const embedding = await client.embed('test', 'query');

    expect(client.getProvider()).toBe('gemini');
    expect(client.getEmbeddingIdentity()).toBe('gemini:gemini-embedding-test');
    expect(chat.content).toBe('{"ok":true}');
    expect(chat.inputTokens).toBe(4);
    expect(embedding.embedding).toHaveLength(1024);
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('gemini-test:generateContent');
    expect(JSON.parse(calls[1][1].body).taskType).toBe('RETRIEVAL_QUERY');
  });

  it('treats the string false as Ollama', () => {
    mockConfig.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'IS_ACTIVE' ? 'false' : fallback,
    );
    client = new OllamaClient(mockConfig);
    expect(client.getProvider()).toBe('ollama');
  });

  it('reuses an embedding generated for the same model, purpose, and text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [Array(1024).fill(0.1)] }),
    });

    await client.embed('same text', 'query');
    await client.embed('same text', 'query');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
