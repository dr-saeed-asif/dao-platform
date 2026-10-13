import type { ModelProviderTransport } from '../model-provider-transport.interface';
import type { OllamaChatResponse, OllamaEmbeddingResponse } from '../configured-language-model-client.service';

export async function chatWithGemini(context: ModelProviderTransport, messages: Array<{ role: string; content: string }>,
options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal }): Promise<OllamaChatResponse> {
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
    const response = await context.fetchWithRetry(
      context.geminiUrl(context.settings.chatModel, 'generateContent'),
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
