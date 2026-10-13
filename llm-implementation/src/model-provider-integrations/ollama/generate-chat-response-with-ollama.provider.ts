import type { ModelProviderTransport } from '../model-provider-transport.interface';
import type { OllamaChatResponse, OllamaEmbeddingResponse } from '../configured-language-model-client.service';

export async function chatWithOllama(context: ModelProviderTransport, messages: Array<{ role: string; content: string }>,
options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal }): Promise<OllamaChatResponse> {
    const start = Date.now();
    const response = await context.fetchWithRetry(
      `${context.settings.ollamaBaseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: context.settings.chatModel,
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
