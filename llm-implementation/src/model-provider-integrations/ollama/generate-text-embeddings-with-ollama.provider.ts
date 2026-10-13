import type { ModelProviderTransport } from '../model-provider-transport.interface';
import type { OllamaChatResponse, OllamaEmbeddingResponse } from '../configured-language-model-client.service';

export async function embedWithOllama(context: ModelProviderTransport, text: string): Promise<OllamaEmbeddingResponse> {
    const start = Date.now();
    const response = await context.fetchWithRetry(
      `${context.settings.ollamaBaseUrl}/api/embed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: context.settings.embeddingModel,
          input: [text],
        }),
      },
    );
    const data = await response.json();
    const embeddings = data.embeddings ?? [];
    context.validateEmbedding(embeddings[0]);

    return {
      embedding: embeddings[0] ?? [],
      latencyMs: Date.now() - start,
    };
  }
