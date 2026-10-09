import {
  requestSignal,
  remainingRequestMs,
  checkRequestBudget,
  abortable,
} from './request-budget';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as waitForRetry } from 'node:timers/promises';
import {
  resolveAiProviderConfig,
  type AiProvider,
  type AiProviderConfig,
} from './ai-provider.config';

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
    const start = Date.now();
    const response = await this.fetchWithRetry(
      `${this.settings.ollamaBaseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.settings.chatModel,
          messages,
          stream: false,
          think: false,
          keep_alive: '15m',
          ...(options?.json ? { format: 'json' } : {}),
          options: { temperature: 0.1, num_predict: options?.maxTokens ?? 768 },
        }),
        signal: options?.signal,
      },
    );

    const data = await response.json();
    const latencyMs = Date.now() - start;

    return {
      content: data.message?.content ?? '',
      latencyMs,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
    };
  }

  private async embedWithOllama(
    text: string,
  ): Promise<OllamaEmbeddingResponse> {
    const start = Date.now();
    const response = await this.fetchWithRetry(
      `${this.settings.ollamaBaseUrl}/api/embed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.settings.embeddingModel,
          input: [text],
        }),
      },
    );
    const data = await response.json();
    const embeddings = data.embeddings ?? [];
    this.validateEmbedding(embeddings[0]);

    return {
      embedding: embeddings[0] ?? [],
      latencyMs: Date.now() - start,
    };
  }

  private async chatWithGemini(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal },
  ): Promise<OllamaChatResponse> {
    const start = Date.now();
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n');
    const contents = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));
    const response = await this.fetchWithRetry(
      this.geminiUrl(this.settings.chatModel, 'generateContent'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(system
            ? { systemInstruction: { parts: [{ text: system }] } }
            : {}),
          contents,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: options?.maxTokens ?? 768,
            ...(options?.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: options?.signal,
      },
    );
    const data = await response.json();
    return {
      content:
        data.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? '')
          .join('') ?? '',
      latencyMs: Date.now() - start,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }

  private async chatWithGroq(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal },
  ): Promise<OllamaChatResponse> {
    const start = Date.now();
    const response = await this.fetchWithRetry(
      `${this.settings.groqBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.settings.groqApiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.chatModel,
          messages,
          stream: false,
          temperature: 0.1,
          max_tokens: options?.maxTokens ?? 768,
          ...(options?.json
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        signal: options?.signal,
      },
    );

    const data = await response.json();
    const latencyMs = Date.now() - start;

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      latencyMs,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }

  private async embedWithGemini(
    text: string,
    purpose: 'document' | 'query',
  ): Promise<OllamaEmbeddingResponse> {
    const start = Date.now();
    const response = await this.fetchWithRetry(
      this.geminiUrl(this.settings.embeddingModel, 'embedContent'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${this.normalizeGeminiModel(this.settings.embeddingModel)}`,
          content: { parts: [{ text }] },
          taskType:
            purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          outputDimensionality: this.settings.embeddingDimension,
        }),
      },
    );
    const data = await response.json();
    const embedding = data.embedding?.values;
    this.validateEmbedding(embedding);
    return { embedding, latencyMs: Date.now() - start };
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
}
