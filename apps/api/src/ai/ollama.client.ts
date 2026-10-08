import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

@Injectable()
export class OllamaClient implements OnModuleInit {
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embedModel: string;
  private readonly embedDimension: number;
  private readonly timeout: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('OLLAMA_BASE_URL').replace(/\/$/, '');
    this.chatModel = config.getOrThrow<string>('OLLAMA_CHAT_MODEL');
    this.embedModel = config.getOrThrow<string>('OLLAMA_EMBED_MODEL');
    this.embedDimension = config.getOrThrow<number>('OLLAMA_EMBED_DIMENSION');
    // Backstop for a single model call. Must exceed any single generation
    // (CPU-bound 4b synthesis can take several minutes) while staying below
    // the 900s overall agent timeout.
    this.timeout = 840_000;
  }

  async onModuleInit(): Promise<void> {
    const health = await this.healthCheck();
    if (health.status !== 'healthy') {
      console.warn(`Ollama health check failed: ${health.error}`);
    }
  }

  async healthCheck(): Promise<OllamaHealthResponse> {
    const start = Date.now();
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - start,
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      const modelExists = data.models?.some(
        (m: { name: string }) => m.name === this.chatModel || m.name === this.embedModel,
      );

      return {
        status: modelExists ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - start,
        model: this.chatModel,
        error: modelExists ? undefined : `Model ${this.chatModel} or ${this.embedModel} not found`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async chat(messages: Array<{ role: string; content: string }>, options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal }): Promise<OllamaChatResponse> {
    const start = Date.now();
    // Streamed so response headers arrive with the first tokens: a
    // minutes-long CPU generation must never look like a stalled request.
    // The assembled content is identical to stream:false.
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        messages,
        stream: true,
        think: false,
        ...(options?.json ? { format: 'json' } : {}),
        options: { temperature: 0.1, num_predict: options?.maxTokens ?? 768 },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      throw new Error(`Ollama chat failed: ${response.status} ${error}`);
    }
    if (!response.body) {
      throw new Error('Ollama chat failed: empty response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const text = line.trim();
        if (!text) continue;
        const chunk = JSON.parse(text) as {
          message?: { content?: string };
          error?: string;
          prompt_eval_count?: number;
          eval_count?: number;
        };
        if (chunk.error) throw new Error(`Ollama chat failed: ${chunk.error}`);
        if (typeof chunk.message?.content === 'string') {
          content += chunk.message.content;
        }
        if (typeof chunk.prompt_eval_count === 'number') {
          inputTokens = chunk.prompt_eval_count;
        }
        if (typeof chunk.eval_count === 'number') {
          outputTokens = chunk.eval_count;
        }
      }
    }

    const latencyMs = Date.now() - start;

    return {
      content,
      latencyMs,
      inputTokens,
      outputTokens,
    };
  }

  async embed(input: string | string[]): Promise<OllamaEmbeddingResponse> {
    const start = Date.now();
    const texts = Array.isArray(input) ? input : [input];

    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embedModel,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      throw new Error(`Ollama embed failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    const embeddings = data.embeddings ?? [];

    for (const emb of embeddings) {
      if (!Array.isArray(emb) || emb.length !== this.embedDimension) {
        throw new Error(
          `Invalid embedding dimension: expected ${this.embedDimension}, got ${emb?.length ?? 'undefined'}`,
        );
      }
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
      return await fetch(url, {
        ...options,
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timeout after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
