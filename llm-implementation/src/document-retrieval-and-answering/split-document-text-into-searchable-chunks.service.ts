import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface Chunk {
  evidenceId: string;
  index: number;
  content: string;
  metadata: Record<string, unknown>;
}

const TARGET_TOKENS = 650;
const OVERLAP_RATIO = 0.12;
const CHUNKING_VERSION = 'v1';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

@Injectable()
export class ChunkingService {
  chunk(
    artefactEvidenceId: string,
    proposalId: string | null,
    text: string,
  ): Chunk[] {
    const sentences = splitIntoSentences(text);
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const prospective = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      const tokens = estimateTokens(prospective);

      if (tokens > TARGET_TOKENS && currentChunk) {
        const evidenceId = this.generateEvidenceId(artefactEvidenceId, chunkIndex);
        chunks.push({
          evidenceId,
          index: chunkIndex,
          content: currentChunk.trim(),
          metadata: { tokenCount: estimateTokens(currentChunk) },
        });
        chunkIndex++;

        const overlapTokens = Math.ceil(TARGET_TOKENS * OVERLAP_RATIO);
        const overlapChars = overlapTokens * 4;
        currentChunk = this.getOverlap(currentChunk, overlapChars) + ` ${sentence}`;
      } else {
        currentChunk = prospective;
      }
    }

    if (currentChunk.trim()) {
      const evidenceId = this.generateEvidenceId(artefactEvidenceId, chunkIndex);
      chunks.push({
        evidenceId,
        index: chunkIndex,
        content: currentChunk.trim(),
        metadata: { tokenCount: estimateTokens(currentChunk) },
      });
    }

    return chunks;
  }

  private getOverlap(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const sentences = splitIntoSentences(text);
    let overlap = '';
    for (let i = sentences.length - 1; i >= 0; i--) {
      const candidate = overlap ? `${sentences[i]} ${overlap}` : sentences[i];
      if (candidate.length > maxChars) break;
      overlap = candidate;
    }
    return overlap || text.slice(-maxChars);
  }

  private generateEvidenceId(artefactEvidenceId: string, chunkIndex: number): string {
    const base = `chunk:${artefactEvidenceId}:${chunkIndex}`;
    return createHash('sha256').update(base).digest('hex').slice(0, 64);
  }

  getChunkingVersion(): string {
    return CHUNKING_VERSION;
  }
}