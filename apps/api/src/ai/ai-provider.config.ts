import type { ConfigService } from '@nestjs/config';

export type AiProvider = 'gemini' | 'ollama' | 'groq';

export type LlmProvider = 'gemini' | 'ollama' | 'groq';

export interface AiProviderConfig {
  provider: AiProvider;
  llmProvider: LlmProvider;
  chatModel: string;
  embeddingModel: string;
  embeddingDimension: number;
  embeddingIdentity: string;
  ollamaBaseUrl?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  groqBaseUrl?: string;
}

const VECTOR_DIMENSION = 1024;

export function resolveAiProviderConfig(
  config: ConfigService,
): AiProviderConfig {
  const isActive = parseBoolean(config.get('IS_ACTIVE', false));
  const llmProvider: LlmProvider =
    (config.get<string>('AI_LLM_PROVIDER') as LlmProvider) ??
    (isActive ? 'gemini' : 'ollama');

  let provider: AiProvider;
  if (llmProvider === 'groq') {
    provider = 'groq';
  } else if (llmProvider === 'gemini') {
    provider = 'gemini';
  } else {
    provider = 'ollama';
  }

  if (provider === 'gemini') {
    const embeddingModel = config.getOrThrow<string>('GEMINI_EMBEDDING_MODEL');
    return {
      provider,
      llmProvider,
      chatModel: config.getOrThrow<string>('GEMINI_LLM_MODEL'),
      embeddingModel,
      embeddingDimension: VECTOR_DIMENSION,
      embeddingIdentity: `gemini:${embeddingModel}`,
      geminiApiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
    };
  }

  if (provider === 'groq') {
    const embeddingModel =
      nonEmpty(config.get<string>('OLLAMA_EMBEDDING_MODEL')) ??
      config.getOrThrow<string>('OLLAMA_EMBED_MODEL');
    const embeddingDimension =
      config.get<number>('OLLAMA_EMBED_DIMENSION') ?? VECTOR_DIMENSION;
    if (embeddingDimension !== VECTOR_DIMENSION) {
      throw new Error(
        `Configured embedding dimension ${embeddingDimension} is incompatible with document_chunks vector(${VECTOR_DIMENSION}).`,
      );
    }
    return {
      provider,
      llmProvider,
      chatModel: config.getOrThrow<string>('GROQ_LLM_MODEL'),
      embeddingModel,
      embeddingDimension,
      embeddingIdentity: `ollama:${embeddingModel}`,
      ollamaBaseUrl: config
        .getOrThrow<string>('OLLAMA_BASE_URL')
        .replace(/\/$/, ''),
      groqApiKey: config.getOrThrow<string>('GROQ_API_KEY'),
      groqBaseUrl: config
        .getOrThrow<string>('GROQ_BASE_URL')
        .replace(/\/$/, ''),
    };
  }

  const embeddingModel =
    nonEmpty(config.get<string>('OLLAMA_EMBEDDING_MODEL')) ??
    config.getOrThrow<string>('OLLAMA_EMBED_MODEL');
  const embeddingDimension =
    config.get<number>('OLLAMA_EMBED_DIMENSION') ?? VECTOR_DIMENSION;
  if (embeddingDimension !== VECTOR_DIMENSION) {
    throw new Error(
      `Configured embedding dimension ${embeddingDimension} is incompatible with document_chunks vector(${VECTOR_DIMENSION}).`,
    );
  }
  return {
    provider,
    llmProvider,
    chatModel:
      nonEmpty(config.get<string>('OLLAMA_LLM_MODEL')) ??
      config.getOrThrow<string>('OLLAMA_CHAT_MODEL'),
    embeddingModel,
    embeddingDimension,
    embeddingIdentity: `ollama:${embeddingModel}`,
    ollamaBaseUrl: config
      .getOrThrow<string>('OLLAMA_BASE_URL')
      .replace(/\/$/, ''),
  };
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
