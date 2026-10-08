import { Injectable } from '@nestjs/common';
import { GeminiClient, GeminiChatResponse } from './gemini.client';

export interface LlmOnlyResponse {
  answer: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

@Injectable()
export class LlmOnlySystem {
  constructor(private readonly ollama: GeminiClient) {}

  async answer(question: string): Promise<LlmOnlyResponse> {
    const messages = [
      {
        role: 'system' as const,
        content: 'You are a helpful assistant. Answer the question directly and concisely.',
      },
      {
        role: 'user' as const,
        content: question,
      },
    ];

    const response = await this.ollama.chat(messages);

    return {
      answer: response.content,
      latencyMs: response.latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  }
}