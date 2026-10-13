import type { ModelProviderTransport } from '../model-provider-transport.interface';
import type { OllamaChatResponse, OllamaEmbeddingResponse } from '../configured-language-model-client.service';

export async function embedWithGemini(context: ModelProviderTransport, text: string,
purpose: 'document' | 'query'): Promise<OllamaEmbeddingResponse> {
    const start = Date.now();
    const response = await context.fetchWithRetry(
      context.geminiUrl(context.settings.embeddingModel, 'embedContent'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${context.normalizeGeminiModel(context.settings.embeddingModel)}`,
          content: { parts: [{ text }] },
          taskType:
            purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          outputDimensionality: context.settings.embeddingDimension,
        }),
      },
    );
    const data = await response.json();
    const embedding = data.embedding?.values;
    context.validateEmbedding(embedding);
    return { embedding, latencyMs: Date.now() - start };
  }
