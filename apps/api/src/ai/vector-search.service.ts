import { checkRequestBudget, abortable, requestSignal } from './request-budget';
import { Injectable } from '@nestjs/common';
import { OllamaClient } from './ollama.client';
import { PostgresService } from '../database/postgres.service';
import { sql } from 'kysely';
import { EmbeddingPipelineService } from './embedding-pipeline.service';

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
    private readonly pipeline: EmbeddingPipelineService,
  ) {}

  private get db() {
    return this.postgres.database;
  }

  async search(question: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const topK = options.topK ?? 5;
    const proposalId = options.proposalId;

    // Linked artefacts are indexed by the background pipeline, never on the query path.
    checkRequestBudget();

    const embedding = await this.ollama.embed(question, 'query');
    const embeddingVector = JSON.stringify(embedding.embedding);

    let query = this.db
      .selectFrom('document_chunks')
      .innerJoin('artefacts', 'artefacts.id', 'document_chunks.artefact_id')
      .innerJoin('proposal_artefacts', 'proposal_artefacts.evidence_id', 'artefacts.evidence_id')
      .select([
        'document_chunks.evidence_id as chunkEvidenceId',
        'document_chunks.content',
        'document_chunks.metadata',
        'proposal_artefacts.proposal_id as localProposalId',
        'artefacts.evidence_id as artefactEvidenceId',
        'artefacts.filename',
        'artefacts.media_type',
      ])
      .where('artefacts.verification_status', '=', 'VERIFIED')
      .where('artefacts.lifecycle_state', '=', 'LINKED')
      .where('document_chunks.embedding_model', '=', this.ollama.getEmbeddingIdentity())
      .where('document_chunks.embedding_dimension', '=', this.ollama.getEmbedDimension())
      .where('document_chunks.embedding', 'is not', null);

    if (proposalId) {
      query = query.where('proposal_artefacts.proposal_id', '=', proposalId);
    }

    query = query
      .select(({ ref }) =>
        sql<number>`1 - (document_chunks.embedding <=> ${embeddingVector}::vector)`.as('similarity'),
      )
      .orderBy('similarity', 'desc')
      .limit(topK);

    checkRequestBudget();
    const results = await abortable(query.execute(), requestSignal());

    return results.map((row, index) => ({
      rank: index + 1,
      score: Number((row as any).similarity ?? 0),
      chunkEvidenceId: row.chunkEvidenceId,
      artefactEvidenceId: row.artefactEvidenceId,
      proposalId: row.localProposalId,
      filename: row.filename,
      content: row.content,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }));
  }
}
