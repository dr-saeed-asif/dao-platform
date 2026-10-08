import { Injectable } from '@nestjs/common';
import { VectorSearchService, SearchResult } from './vector-search.service';
import { GeminiClient, GeminiChatResponse } from './gemini.client';

export interface VectorRagResponse {
  answer: string;
  evidence: SearchResult[];
  latencyMs: number;
  retrievalLatencyMs: number;
  generationLatencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

@Injectable()
export class VectorRagSystem {
  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly ollama: GeminiClient,
  ) {}

  async answer(question: string, proposalId?: string, topK: number = 5): Promise<VectorRagResponse> {
    const retrievalStart = Date.now();
    const results = await this.vectorSearch.search(question, { proposalId, topK });
    const retrievalLatencyMs = Date.now() - retrievalStart;

    if (results.length === 0) {
      return {
        answer: 'No indexed document evidence was found for this proposal.',
        evidence: [],
        latencyMs: retrievalLatencyMs,
        retrievalLatencyMs,
        generationLatencyMs: 0,
      };
    }

    const context = results
      .map((r, i) => `[${i + 1}] ${r.content} [source: ${r.chunkEvidenceId}; artefact: ${r.artefactEvidenceId}]`)
      .join('\n\n');

    const messages = [
      {
        role: 'system' as const,
        content: `You are an AI assistant that answers questions using ONLY the provided context. 
If the context does not contain enough information to answer the question, state that clearly.
Do not invent information or evidence IDs.
Cite evidence IDs in your answer using the format [source: chunkEvidenceId].`,
      },
      {
        role: 'user' as const,
        content: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer using only the context above. Cite evidence IDs.`,
      },
    ];

    const generationStart = Date.now();
    const response = await this.ollama.chat(messages);
    const generationLatencyMs = Date.now() - generationStart;

    return {
      answer: response.content,
      evidence: results,
      latencyMs: retrievalLatencyMs + generationLatencyMs,
      retrievalLatencyMs,
      generationLatencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  }
}
