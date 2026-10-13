import type { ModelProviderTransport } from './model-provider-transport.interface';
import { chatWithOllama } from './ollama/generate-chat-response-with-ollama.provider';
import { embedWithOllama } from './ollama/generate-text-embeddings-with-ollama.provider';
import { chatWithGemini } from './gemini/generate-chat-response-with-gemini.provider';
import { chatWithGroq } from './groq/generate-chat-response-with-groq.provider';
import { embedWithGemini } from './gemini/generate-text-embeddings-with-gemini.provider';
import {
  requestSignal,
  remainingRequestMs,
  checkRequestBudget,
  abortable,
} from '../request-deadlines-and-call-limits/governance-analysis-request-limits';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as waitForRetry } from 'node:timers/promises';
import {
  resolveAiProviderConfig,
  type AiProvider,
  type AiProviderConfig,
} from './language-model-provider-configuration';

export interface OllamaHealthResponse {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  model?: string;
  error?: string;
}

export interface OllamaChatResponse {
  content: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
  latencyMs: number;
}

export class AiProviderError extends Error {
  constructor(
    readonly code:
      | 'PROVIDER_HTTP'
      | 'PROVIDER_TIMEOUT'
      | 'PROVIDER_NETWORK'
      | 'PROVIDER_CANCELLED',
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

@Injectable()
/** Shared AI provider facade. The class name is retained for API compatibility. */
export class OllamaClient implements OnModuleInit {
  private readonly settings: AiProviderConfig;
  private readonly timeout = 60_000;
  private readonly embeddingCache = new Map<string, OllamaEmbeddingResponse>();

  constructor(config: ConfigService) {
    this.settings = resolveAiProviderConfig(config);
  }

  async onModuleInit(): Promise<void> {
    const health = await this.healthCheck();
    if (health.status !== 'healthy') {
      console.warn(
        `${this.settings.provider} health check failed: ${health.error}`,
      );
    }
  }

  async healthCheck(): Promise<OllamaHealthResponse> {
    const start = Date.now();
    try {
      let modelExists: boolean;
      if (this.settings.provider === 'gemini') {
        modelExists = await this.checkGeminiModels();
      } else if (this.settings.provider === 'groq') {
        modelExists = await this.checkGroqModels();
      } else {
        modelExists = await this.checkOllamaModels();
      }

      return {
        status: modelExists ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - start,
        model: this.settings.chatModel,
        error: modelExists
          ? undefined
          : 'Configured chat or embedding model was not found.',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal },
  ): Promise<OllamaChatResponse> {
    if (this.settings.provider === 'gemini') {
      return this.chatWithGemini(messages, options);
    }
    if (this.settings.provider === 'groq') {
      return this.chatWithGroq(messages, options);
    }
    return this.chatWithOllama(messages, options);
  }

  async embed(
    input: string | string[],
    purpose: 'document' | 'query' = 'document',
  ): Promise<OllamaEmbeddingResponse> {
    checkRequestBudget();
    const text = (Array.isArray(input) ? input[0] : input)?.trim();
    if (!text) throw new Error('Embedding input must not be empty.');
    const key = `${this.settings.embeddingIdentity}:${purpose}:${text}`;
    const cached = this.embeddingCache.get(key);
    if (cached) return cached;

    const result = await (this.settings.provider === 'gemini'
      ? this.embedWithGemini(text, purpose)
      : this.embedWithOllama(text));
    checkRequestBudget();
    this.embeddingCache.set(key, result);
    if (this.embeddingCache.size > 256)
      this.embeddingCache.delete(this.embeddingCache.keys().next().value!);
    return result;
  }

  getProvider(): AiProvider {
    return this.settings.provider;
  }

  getChatModel(): string {
    return this.settings.chatModel;
  }

  getEmbedModel(): string {
    return this.settings.embeddingModel;
  }

  getEmbeddingIdentity(): string {
    return this.settings.embeddingIdentity;
  }

  getEmbedDimension(): number {
    return this.settings.embeddingDimension;
  }

  private async chatWithOllama(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal },
  ): Promise<OllamaChatResponse> {
    return chatWithOllama(this.providerTransport(), messages, options);
  }

  private async embedWithOllama(
    text: string,
  ): Promise<OllamaEmbeddingResponse> {
    return embedWithOllama(this.providerTransport(), text);
  }

  private async chatWithGemini(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal },
  ): Promise<OllamaChatResponse> {
    return chatWithGemini(this.providerTransport(), messages, options);
  }

  private async chatWithGroq(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal },
  ): Promise<OllamaChatResponse> {
    return chatWithGroq(this.providerTransport(), messages, options);
  }

  private async embedWithGemini(
    text: string,
    purpose: 'document' | 'query',
  ): Promise<OllamaEmbeddingResponse> {
    return embedWithGemini(this.providerTransport(), text, purpose);
  }

  private validateEmbedding(embedding: unknown): asserts embedding is number[] {
    if (
      !Array.isArray(embedding) ||
      embedding.length !== this.settings.embeddingDimension
    ) {
      throw new Error(
        `Invalid embedding dimension: expected ${this.settings.embeddingDimension}, got ${Array.isArray(embedding) ? embedding.length : 'undefined'}`,
      );
    }
  }

  private async checkOllamaModels(): Promise<boolean> {
    const response = await this.fetchWithRetry(
      `${this.settings.ollamaBaseUrl}/api/tags`,
      { method: 'GET' },
    );
    const data = await response.json();
    const models = new Set(
      (data.models ?? []).map((model: { name: string }) => model.name),
    );
    return (
      models.has(this.settings.chatModel) &&
      models.has(this.settings.embeddingModel)
    );
  }

  private async checkGeminiModels(): Promise<boolean> {
    const [chat, embedding] = await Promise.all([
      this.fetchWithRetry(this.geminiModelUrl(this.settings.chatModel), {
        method: 'GET',
      }),
      this.fetchWithRetry(this.geminiModelUrl(this.settings.embeddingModel), {
        method: 'GET',
      }),
    ]);
    return chat.ok && embedding.ok;
  }

  private async checkGroqModels(): Promise<boolean> {
    try {
      const response = await this.fetchWithRetry(
        `${this.settings.groqBaseUrl}/models`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.settings.groqApiKey}`,
          },
        },
      );
      const data = await response.json();
      const models = new Set(
        (data.data ?? []).map((model: { id: string }) => model.id),
      );
      return models.has(this.settings.chatModel);
    } catch {
      return false;
    }
  }

  private geminiUrl(model: string, operation: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.normalizeGeminiModel(model))}:${operation}?key=${encodeURIComponent(this.settings.geminiApiKey!)}`;
  }

  private geminiModelUrl(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.normalizeGeminiModel(model))}?key=${encodeURIComponent(this.settings.geminiApiKey!)}`;
  }

  private normalizeGeminiModel(model: string): string {
    return model.replace(/^models\//, '');
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
  ): Promise<{ ok: boolean; json(): Promise<any> }> {
    const request = requestSignal();
    const externalSignals = [request, options.signal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    const externalSignal = externalSignals.length
      ? AbortSignal.any(externalSignals)
      : undefined;
    const attempts = 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      checkRequestBudget();
      const controller = new AbortController();
      const timeoutMs = request
        ? Math.min(this.timeout, remainingRequestMs())
        : this.timeout;
      const timeoutId = setTimeout(
        () => controller.abort(new Error('AI provider deadline exceeded.')),
        timeoutMs,
      );
      const signals = [controller.signal, request, options.signal].filter(
        (signal): signal is AbortSignal => Boolean(signal),
      );
      const signal = AbortSignal.any(signals);
      try {
        signal.throwIfAborted();
        const response = await abortable(
          fetch(url, { ...options, signal }),
          signal,
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw new AiProviderError(
            'PROVIDER_HTTP',
            this.settings.provider +
              ' request failed with HTTP ' +
              response.status +
              '.',
            response.status === 429 || response.status >= 500,
            response.status,
          );
        }
        // Keep cancellation active through body consumption, not only response headers.
        const data = await abortable(response.json(), signal);
        return { ok: true, json: async () => data };
      } catch (error) {
        if (externalSignal?.aborted)
          throw new AiProviderError(
            'PROVIDER_CANCELLED',
            'AI request reached its deadline or was cancelled.',
          );
        const failure = controller.signal.aborted
          ? new AiProviderError(
              'PROVIDER_TIMEOUT',
              'AI provider exceeded its response time limit.',
              true,
            )
          : error instanceof TypeError
            ? new AiProviderError(
                'PROVIDER_NETWORK',
                'Connection to the AI provider failed. Please retry.',
                true,
              )
            : error;
        if (
          attempt === attempts - 1 ||
          (failure as { retryable?: boolean }).retryable === false
        ) {
          throw failure;
        }
      } finally {
        clearTimeout(timeoutId);
      }
      await waitForRetry(250 * 2 ** attempt, undefined, {
        signal: externalSignal,
      });
    }
    throw new Error('AI provider request failed.');
  }

  private providerTransport(): ModelProviderTransport {
    return {
      settings: this.settings,
      fetchWithRetry: (url, options) => this.fetchWithRetry(url, options),
      validateEmbedding: (embedding: unknown): asserts embedding is number[] => this.validateEmbedding(embedding),
      geminiUrl: (model, operation) => this.geminiUrl(model, operation),
      normalizeGeminiModel: (model) => this.normalizeGeminiModel(model),
    };
  }
}
