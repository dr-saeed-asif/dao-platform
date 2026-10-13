import type { AiProviderConfig } from './language-model-provider-configuration';
export interface ModelProviderTransport {
 settings: AiProviderConfig;
 fetchWithRetry(url: string, options: RequestInit): Promise<{ ok: boolean; json(): Promise<any> }>;
 validateEmbedding(embedding: unknown): asserts embedding is number[];
 geminiUrl(model: string, operation: string): string;
 normalizeGeminiModel(model: string): string;
}
