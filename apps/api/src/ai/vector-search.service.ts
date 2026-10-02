import { Injectable } from '@nestjs/common';
import { OllamaClient, OllamaEmbeddingResponse } from './ollama.client';
import { PostgresService } from '../database/postgres.service';
import { sql } from 'kysely';

export interface SearchResult {
  rank: number;
  score: number;
  chunkEvidenceId: string;
  artefactEvidenceId: string;
  proposalId: string | null;
  filename: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  proposalId?: string;
  topK?: number;
}

@Injectable()
export class VectorSearchService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly ollama: OllamaClient,
  ) {}

  private get db() {
    return this.postgres.database;
  }

  async search(question: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const topK = options.topK ?? 5;
    const proposalId = options.proposalId;

    const embedding = await this.ollama.embed(question);
    const embeddingVector = JSON.stringify(embedding.embedding);

    let query = this.db
      .selectFrom('document_chunks')
      .innerJoin('artefacts', 'artefacts.id', 'document_chunks.artefact_id')
      .select([
        'document_chunks.evidence_id as chunkEvidenceId',
        'document_chunks.content',
        'document_chunks.metadata',
        'document_chunks.proposal_id',
        'artefacts.evidence_id as artefactEvidenceId',
        'artefacts.filename',
        'artefacts.media_type',
      ]);

    if (proposalId) {
      query = query.where('document_chunks.proposal_id', '=', proposalId);
    }

    query = query
      .select(({ ref }) =>
        sql<number>`1 - (document_chunks.embedding <=> ${embeddingVector}::vector)`.as('similarity'),
      )
      .orderBy('similarity', 'desc')
      .limit(topK);

    const results = await query.execute();

    return results.map((row, index) => ({
      rank: index + 1,
      score: Number((row as any).similarity ?? 0),
      chunkEvidenceId: row.chunkEvidenceId,
      artefactEvidenceId: row.artefactEvidenceId,
      proposalId: row.proposal_id ? row.proposal_id.toString() : null,
      filename: row.filename,
      content: row.content,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }));
  }
}