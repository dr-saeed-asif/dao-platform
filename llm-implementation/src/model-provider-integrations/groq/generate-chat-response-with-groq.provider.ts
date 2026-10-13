import type { ModelProviderTransport } from '../model-provider-transport.interface';
import type { OllamaChatResponse, OllamaEmbeddingResponse } from '../configured-language-model-client.service';

export async function chatWithGroq(context: ModelProviderTransport, messages: Array<{ role: string; content: string }>,
options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal }): Promise<OllamaChatResponse> {
    const start = Date.now();
    const response = await context.fetchWithRetry(
      `${context.settings.groqBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${context.settings.groqApiKey}`,
        },
        body: JSON.stringify({
          model: context.settings.chatModel,
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
