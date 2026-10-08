import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent } from 'undici';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export interface GeminiHealthResponse {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  model?: string;
  error?: string;
}

export interface GeminiChatResponse {
  content: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface GeminiEmbeddingResponse {
  embedding: number[];
  latencyMs: number;
}

interface GeminiContentPart {
  text?: string;
}

interface GeminiContent {
  role?: string;
  parts?: GeminiContentPart[];
}

interface GeminiCandidate {
  content?: { parts?: GeminiContentPart[] };
  finishReason?: string;
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
}

const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_TRANSPORT = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);

class GeminiRequestError extends Error {
  constructor(
    readonly code: string,
    readonly category: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    readonly causeCodes: string[] = [],
    readonly retryAfterMs = 0,
  ) {
    super(`Gemini chat failed: ${httpStatus ? `${httpStatus} ` : ''}${category} (${code}${causeCodes.length ? `; causes: ${causeCodes.join(', ')}` : ''})`);
  }
}

/**
 * Google Gemini backend for chat (structured JSON) and embeddings.
 *
 * Drop-in replacement for OllamaClient: identical public surface
 * (healthCheck/chat/embed/model getters) so all AI systems, pipelines and
 * run recording behave exactly as before. The API key is sent via header
 * and never logged or exposed.
 */
@Injectable()
export class GeminiClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeminiClient.name);
  // Request-scoped dispatcher: only this client's Google requests use IPv4.
  private readonly dispatcher = new Agent({ connect: { family: 4 } });
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private readonly apiKey: string;
  private readonly chatModel: string;
  private readonly embedModel: string;
  private readonly embedDimension: number;
  private readonly timeout: number;
  private readonly chatTimeout: number;
  private readonly chatDeadline: number;
  private readonly maxRetries = 2;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('GEMINI_API_KEY');
    this.chatModel = config.getOrThrow<string>('GEMINI_CHAT_MODEL');
    this.embedModel = config.getOrThrow<string>('GEMINI_EMBED_MODEL');
    this.embedDimension = config.getOrThrow<number>('GEMINI_EMBED_DIMENSION');
    // Backstop for a single model call. Must stay below the overall agent
    // timeout while allowing slow generations to finish.
    this.timeout = 840_000;
    this.chatTimeout = Number(config.get<number>('GEMINI_CHAT_TIMEOUT_MS') ?? 30_000);
    this.chatDeadline = Number(config.get<number>('GEMINI_CHAT_DEADLINE_MS') ?? 100_000);
  }

  async onModuleInit(): Promise<void> {
    const health = await this.healthCheck();
    if (health.status !== 'healthy') {
      console.warn(`Gemini health check failed: ${health.error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispatcher.close();
  }

  async healthCheck(): Promise<GeminiHealthResponse> {
    const start = Date.now();
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/models/${this.chatModel}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - start,
          error: `HTTP ${response.status}`,
        };
      }

      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
        model: this.chatModel,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async chat(messages: Array<{ role: string; content: string }>, options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal }): Promise<GeminiChatResponse> {
    const start = Date.now();
    const systemTexts = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);
    const contents: GeminiContent[] = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    const data = await this.generateWithRetries(JSON.stringify({
      ...(systemTexts.length
        ? { systemInstruction: { parts: systemTexts.map((text) => ({ text })) } }
        : {}),
      contents,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: options?.maxTokens ?? 768,
        ...(options?.json ? { responseMimeType: 'application/json' } : {}),
      },
    }), options?.signal);
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const content = parts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
    const latencyMs = Date.now() - start;

    return {
      content,
      latencyMs,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }

  private async generateWithRetries(body: string, callerSignal?: AbortSignal): Promise<GeminiGenerateResponse> {
    const started = Date.now();
    const requestId = randomUUID();
    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => deadline.abort(), this.chatDeadline);
    const totalSignal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
    let attempts = 0;
    try {
      while (true) {
        const attempt = new AbortController();
        const timer = setTimeout(() => attempt.abort(), this.chatTimeout);
        const signal = AbortSignal.any([totalSignal, attempt.signal]);
        let failure: GeminiRequestError;
        try {
          signal.throwIfAborted();
          attempts++;
          const init: RequestInit & { dispatcher: Agent } = {
            method: 'POST', body, signal, dispatcher: this.dispatcher,
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          };
          const response = await fetch(`${this.baseUrl}/models/${this.chatModel}:generateContent`, init);
          if (!response.ok) {
            const retryAfter = response.headers?.get('retry-after');
            const retryAfterMs = retryAfter
              ? Math.max(0, /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now())
              : 0;
            // Never log raw provider bodies, prompts, headers, or request URLs.
            await response.body?.cancel();
            throw new GeminiRequestError(`HTTP_${response.status}`, 'HTTP', RETRYABLE_HTTP.has(response.status), response.status, [], Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
          }
          // The attempt timer stays active until the entire response body is read.
          const data = await response.json() as GeminiGenerateResponse;
          signal.throwIfAborted();
          if (data.error) throw new GeminiRequestError('PROVIDER_ERROR', 'PROVIDER');
          this.logger.log(JSON.stringify({ event: 'gemini.chat.complete', requestId, httpStatus: response.status, attempts, retryCount: attempts - 1, latencyMs: Date.now() - started }));
          return data;
        } catch (error) {
          failure = this.chatFailure(error, callerSignal, deadline.signal, attempt.signal);
        } finally {
          clearTimeout(timer);
        }
        const retryCount = Math.max(0, attempts - 1);
        const delayMs = Math.max(1000 * 2 ** retryCount + Math.floor(Math.random() * 250), failure.retryAfterMs);
        const willRetry = failure.retryable && attempts <= this.maxRetries && !totalSignal.aborted
          && Date.now() - started + delayMs < this.chatDeadline;
        this.logger.warn(JSON.stringify({ event: 'gemini.chat.attempt_failed', requestId, attempts, retryCount,
          category: failure.category, code: failure.code, causeCodes: failure.causeCodes, httpStatus: failure.httpStatus,
          willRetry, ...(willRetry ? { retryDelayMs: delayMs } : {}), latencyMs: Date.now() - started }));
        if (!willRetry) throw failure;
        try {
          await sleep(delayMs, undefined, { signal: totalSignal });
        } catch (error) {
          throw this.chatFailure(error, callerSignal, deadline.signal);
        }
      }
    } catch (error) {
      const failure = this.chatFailure(error, callerSignal, deadline.signal);
      this.logger.error(JSON.stringify({ event: 'gemini.chat.failed', requestId, attempts, retryCount: Math.max(0, attempts - 1),
        category: failure.category, code: failure.code, causeCodes: failure.causeCodes, httpStatus: failure.httpStatus, latencyMs: Date.now() - started }));
      throw new Error(`${failure.message}; attempts=${attempts}; retries=${Math.max(0, attempts - 1)}; latencyMs=${Date.now() - started}`);
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  private chatFailure(error: unknown, caller?: AbortSignal, deadline?: AbortSignal, attempt?: AbortSignal): GeminiRequestError {
    if (caller?.aborted) return new GeminiRequestError('CALLER_ABORTED', 'CANCELLED');
    if (deadline?.aborted) return new GeminiRequestError('DEADLINE_EXCEEDED', 'TIMEOUT');
    if (attempt?.aborted) return new GeminiRequestError('REQUEST_TIMEOUT', 'TIMEOUT', true);
    if (error instanceof GeminiRequestError) return error;
    // Only known transport codes are retained. Arbitrary exception messages may contain secrets.
    const codes: string[] = [];
    let current = error as { code?: unknown; cause?: unknown } | undefined;
    for (let depth = 0; current && depth < 6; depth++) {
      const code = typeof current.code === 'string' ? current.code : '';
      if (RETRYABLE_TRANSPORT.has(code) || ['ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH',
        'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR'].includes(code)) codes.push(code);
      current = current.cause as typeof current;
    }
    const code = codes[0] ?? (error instanceof SyntaxError ? 'INVALID_JSON_RESPONSE' : 'UNKNOWN_TRANSPORT_ERROR');
    const category = codes.some((item) => /TIMEOUT|ETIMEDOUT/.test(item)) ? 'TIMEOUT'
      : codes.some((item) => /ENOTFOUND|EAI_AGAIN/.test(item)) ? 'DNS'
      : codes.some((item) => /TLS|SSL|CERT|SIGNATURE/.test(item)) ? 'TLS' : 'TRANSPORT';
    return new GeminiRequestError(code, category, RETRYABLE_TRANSPORT.has(code), undefined, codes);
  }

  async embed(input: string | string[]): Promise<GeminiEmbeddingResponse> {
    const start = Date.now();
    const texts = Array.isArray(input) ? input : [input];
    const embeddings: number[][] = [];

    for (const text of texts) {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/models/${this.embedModel}:embedContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${this.embedModel}`,
            content: { parts: [{ text }] },
            outputDimensionality: this.embedDimension,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text().catch(() => '');
        throw new Error(`Gemini embed failed: ${response.status} ${error}`);
      }

      const data = (await response.json()) as {
        embedding?: { values?: unknown };
        error?: { message?: string };
      };
      if (data.error) {
        throw new Error(`Gemini embed failed: ${data.error.message ?? 'unknown error'}`);
      }
      const values = data.embedding?.values;
      if (!Array.isArray(values) || values.length !== this.embedDimension) {
        throw new Error(
          `Invalid embedding dimension: expected ${this.embedDimension}, got ${Array.isArray(values) ? values.length : 'undefined'}`,
        );
      }
      embeddings.push(values as number[]);
    }

    return {
      embedding: embeddings[0] ?? [],
      latencyMs: Date.now() - start,
    };
  }

  getChatModel(): string {
    return this.chatModel;
  }

  getEmbedModel(): string {
    return this.embedModel;
  }

  getEmbedDimension(): number {
    return this.embedDimension;
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const signal = options.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal;
      const requestOptions: RequestInit & { dispatcher: Agent } = {
        ...options,
        dispatcher: this.dispatcher,
        headers: {
          ...(options.headers ?? {}),
          'x-goog-api-key': this.apiKey,
        },
        signal,
      };
      return await fetch(url, requestOptions);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Gemini request timeout after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
