import { ConfigService } from '@nestjs/config';
import { GeminiClient } from '../gemini.client';
import { Agent } from 'undici';
import { Logger } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';

jest.mock('@nestjs/config');
jest.mock('node:timers/promises', () => ({ setTimeout: jest.fn().mockResolvedValue(undefined) }));
jest.mock('undici', () => ({
  Agent: jest.fn().mockImplementation(() => ({ close: jest.fn().mockResolvedValue(undefined) })),
}));

describe('GeminiClient', () => {
  let client: GeminiClient;
  let mockConfig: jest.Mocked<ConfigService>;
  const originalFetch = global.fetch;

  afterEach(async () => {
    await client.onModuleDestroy();
    global.fetch = originalFetch;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.mocked(sleep).mockReset().mockResolvedValue(undefined);
    mockConfig = {
      getOrThrow: jest.fn(),
      get: jest.fn(),
    } as any;

    mockConfig.getOrThrow.mockImplementation((key: string) => {
      const values: Record<string, string | number> = {
        GEMINI_API_KEY: 'test-key',
        GEMINI_CHAT_MODEL: 'gemini-3.8-flash',
        GEMINI_EMBED_MODEL: 'gemini-embedding-2',
        GEMINI_EMBED_DIMENSION: 1024,
      };
      if (key in values) return values[key];
      throw new Error(`Missing config: ${key}`);
    });

    client = new GeminiClient(mockConfig);
  });

  describe('getters', () => {
    it('should return chat model', () => {
      expect(client.getChatModel()).toBe('gemini-3.8-flash');
    });

    it('should return embed model', () => {
      expect(client.getEmbedModel()).toBe('gemini-embedding-2');
    });

    it('should return embed dimension', () => {
      expect(client.getEmbedDimension()).toBe(1024);
    });
  });

  describe('healthCheck', () => {
    it('uses its IPv4 dispatcher for Gemini requests and closes it on shutdown', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await client.healthCheck();
      const dispatcher = (Agent as jest.Mock).mock.results[0].value;
      expect(Agent).toHaveBeenCalledWith({ connect: { family: 4 } });
      expect((global.fetch as jest.Mock).mock.calls[0][1].dispatcher).toBe(dispatcher);
      await client.onModuleDestroy();
      expect(dispatcher.close).toHaveBeenCalled();
    });
    it('should return healthy when the model resolves', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await client.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.model).toBe('gemini-3.8-flash');
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('gemini-3.8-flash');
    });

    it('should return unhealthy when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('chat', () => {
    const success = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'answer' }] } }] }) });

    it.each([429, 500, 502, 503, 504])('retries temporary HTTP %s twice with exponential backoff', async (status) => {
      const cancel = jest.fn().mockResolvedValue(undefined);
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, status, body: { cancel } })
        .mockResolvedValueOnce({ ok: false, status, body: { cancel } })
        .mockResolvedValueOnce(success());
      expect((await client.chat([{ role: 'user', content: 'test' }])).content).toBe('answer');
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(cancel).toHaveBeenCalledTimes(2);
      const delays = jest.mocked(sleep).mock.calls.map((call) => call[0]);
      expect(delays[0]).toBeGreaterThanOrEqual(1000);
      expect(delays[0]).toBeLessThan(1250);
      expect(delays[1]).toBeGreaterThanOrEqual(2000);
      expect(delays[1]).toBeLessThan(2250);
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('"retryCount":2'));
    });

    it('stops after three attempts and reports the final HTTP cause', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('HTTP_503');
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('"retryCount":2'));
    });

    it.each([400, 401, 403, 404])('does not retry permanent HTTP %s or expose its response body', async (status) => {
      const text = jest.fn().mockResolvedValue('test-key other-secret');
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status, text });
      await expect(client.chat([{ role: 'user', content: 'private-prompt' }])).rejects.toThrow(`HTTP_${status}`);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
      const logs = JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls);
      expect(logs).not.toContain('test-key');
      expect(logs).not.toContain('other-secret');
      expect(logs).not.toContain('private-prompt');
    });

    it('honors Retry-After within the total deadline', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '3' }) }).mockResolvedValueOnce(success());
      await client.chat([{ role: 'user', content: 'test' }]);
      expect(sleep).toHaveBeenCalledWith(3000, undefined, expect.any(Object));
    });

    it('does not sleep/retry beyond the overall deadline', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }) });
      await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('HTTP_429');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('logs nested ECONNRESET without exposing exception secrets and retries it', async () => {
      const error = new TypeError('fetch failed test-key', { cause: Object.assign(new Error('secret-token'), { code: 'ECONNRESET' }) });
      global.fetch = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(success());
      await client.chat([{ role: 'user', content: 'test' }]);
      const logs = JSON.stringify((Logger.prototype.warn as jest.Mock).mock.calls);
      expect(logs).toContain('ECONNRESET');
      expect(logs).not.toContain('test-key');
      expect(logs).not.toContain('secret-token');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it.each([['ENOTFOUND', 'DNS'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS'], ['UND_ERR_HEADERS_TIMEOUT', 'TIMEOUT']])('classifies %s as %s', async (code, category) => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed', { cause: Object.assign(new Error('sensitive message'), { code }) }));
      await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(`${category} (${code}`);
      expect(global.fetch).toHaveBeenCalledTimes(category === 'TIMEOUT' ? 3 : 1);
    });

    it('keeps the deadline active while reading a stalled response body', async () => {
      await client.onModuleDestroy();
      mockConfig.get.mockImplementation((key: string) => key === 'GEMINI_CHAT_DEADLINE_MS' ? 30 : 1000);
      client = new GeminiClient(mockConfig);
      global.fetch = jest.fn().mockImplementation(async (_url, init) => ({
        ok: true, status: 200,
        json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })),
      }));
      await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('DEADLINE_EXCEEDED');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('retries per-attempt timeouts but never exceeds the retry limit', async () => {
      await client.onModuleDestroy();
      mockConfig.get.mockImplementation((key: string) => key === 'GEMINI_CHAT_TIMEOUT_MS' ? 20 : 100_000);
      client = new GeminiClient(mockConfig);
      global.fetch = jest.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }));
      await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('REQUEST_TIMEOUT');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('does not send a request when already cancelled by the caller', async () => {
      global.fetch = jest.fn();
      await expect(client.chat([{ role: 'user', content: 'test' }], { signal: AbortSignal.abort() })).rejects.toThrow('CALLER_ABORTED');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('stops retries when the caller cancels during backoff', async () => {
      const controller = new AbortController();
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      jest.mocked(sleep).mockImplementationOnce(async () => {
        controller.abort();
        throw new Error('aborted');
      });
      await expect(client.chat([{ role: 'user', content: 'test' }], { signal: controller.signal })).rejects.toThrow('CALLER_ABORTED');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should map system role to systemInstruction and request JSON output', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"answer":"yes"}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      });

      const result = await client.chat(
        [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
        ],
        { json: true },
      );

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('gemini-3.8-flash:generateContent');
      expect(init.headers['x-goog-api-key']).toBe('test-key');
      expect(init.dispatcher).toBe((Agent as jest.Mock).mock.results[0].value);
      const body = JSON.parse(init.body);
      expect(body.systemInstruction.parts).toEqual([{ text: 'Be brief.' }]);
      expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Hi' }] }]);
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(result.content).toBe('{"answer":"yes"}');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
    });

    it('should throw on API errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' });

      await expect(client.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
        'Gemini chat failed: 404',
      );
    });
  });

  describe('embed', () => {
    it('should request outputDimensionality and validate dimension', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: { values: [0.1, 0.2] } }),
      });

      await expect(client.embed('test')).rejects.toThrow('Invalid embedding dimension');
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect((global.fetch as jest.Mock).mock.calls[0][1].dispatcher).toBe((Agent as jest.Mock).mock.results[0].value);
      expect(body.outputDimensionality).toBe(1024);
      expect(body.model).toBe('models/gemini-embedding-2');
    });
  });
});
