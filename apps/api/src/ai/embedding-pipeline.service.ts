import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { LocalArtefactStorage } from '../research/local-artefact.storage';
import { TextExtractionService, ExtractionResult } from './text-extraction.service';
import { ChunkingService, Chunk } from './chunking.service';
import { OllamaClient, OllamaEmbeddingResponse } from './ollama.client';
import { sha256 } from '@dao-platform/database';

export interface IndexResult {
  artefactEvidenceId: string;
  chunksIndexed: number;
  chunksSkipped: number;
  errors: string[];
}

interface ArtefactRow {
  evidence_id: string;
  storage_key: string;
  media_type: string;
  filename: string | null;
  id: string;
  proposal_id: string | null;
  computed_hash: string;
}

@Injectable()
export class EmbeddingPipelineService implements OnModuleInit, OnApplicationShutdown {
  private indexing: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  constructor(
    private readonly postgres: PostgresService,
    private readonly storage: LocalArtefactStorage,
    private readonly textExtraction: TextExtractionService,
    private readonly chunking: ChunkingService,
    private readonly ollama: OllamaClient,
  ) {}

  private get db() {
    return this.postgres.database;
  }

  async onModuleInit(): Promise<void> {
    await this.indexLinkedArtefacts();
    this.timer = setInterval(() => void this.indexLinkedArtefacts(), 5_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async indexLinkedArtefacts(): Promise<void> {
    if (this.indexing) return this.indexing;
    this.indexing = (async () => {
      const rows = await this.db.selectFrom('artefacts')
        .innerJoin('proposal_artefacts', 'proposal_artefacts.evidence_id', 'artefacts.evidence_id')
        .select('artefacts.evidence_id')
        .where('artefacts.verification_status', '=', 'VERIFIED')
        .where('artefacts.lifecycle_state', '=', 'LINKED')
        .distinct()
        .execute();
      for (const row of rows) {
        try { await this.indexArtefact(row.evidence_id); }
        catch (error) { console.error(`Failed to index ${row.evidence_id}:`, error); }
      }
    })().finally(() => { this.indexing = undefined; });
    return this.indexing;
  }

  async indexArtefact(artefactEvidenceId: string): Promise<IndexResult> {
    const artefact = await this.db
      .selectFrom('artefacts')
      .selectAll()
      .where('evidence_id', '=', artefactEvidenceId)
      .executeTakeFirst();

    if (!artefact) {
      throw new Error(`Artefact not found: ${artefactEvidenceId}`);
    }

    if (!artefact.storage_key) {
      throw new Error(`Artefact has no storage key: ${artefactEvidenceId}`);
    }

    const fileBytes = await this.storage.get(artefact.storage_key);
    if (sha256(fileBytes) !== artefact.computed_hash) {
      await this.db.updateTable('artefacts').set({ verification_status: 'FAILED' }).where('evidence_id', '=', artefactEvidenceId).execute();
      throw new Error(`Artefact hash verification failed: ${artefactEvidenceId}`);
    }

    return this.indexArtefactWithContent(artefact as ArtefactRow, fileBytes);
  }

  async indexArtefactWithContent(
    artefact: ArtefactRow,
    fileBytes: Buffer,
  ): Promise<IndexResult> {
    const errors: string[] = [];
    let chunksIndexed = 0;
    let chunksSkipped = 0;

    const extraction = await this.textExtraction.extract(
      fileBytes,
      artefact.media_type,
      artefact.filename ?? 'document',
    );

    if (extraction.status === 'ERROR') {
      return {
        artefactEvidenceId: artefact.evidence_id,
        chunksIndexed: 0,
        chunksSkipped: 0,
        errors: [extraction.error ?? 'Extraction failed'],
      };
    }

    const existingChunks = await this.db
      .selectFrom('document_chunks')
      .select(['evidence_id', 'content', 'embedding', 'embedding_model', 'embedding_dimension', 'chunking_version'])
      .where('artefact_id', '=', artefact.id)
      .execute();

    const existingByEvidenceId = new Map(existingChunks.map((c) => [c.evidence_id, c]));

    const chunks = this.chunking.chunk(
      artefact.evidence_id,
      artefact.proposal_id,
      extraction.text,
    );

    for (const chunk of chunks) {
      const existing = existingByEvidenceId.get(chunk.evidenceId);
      if (existing && existing.content === chunk.content && existing.embedding && existing.embedding_model === this.ollama.getEmbedModel() && existing.embedding_dimension === this.ollama.getEmbedDimension() && existing.chunking_version === this.chunking.getChunkingVersion()) {
        chunksSkipped++;
        continue;
      }

      const embedding = await this.ollama.embed(chunk.content);

      await this.db
        .insertInto('document_chunks')
        .values({
          evidence_id: chunk.evidenceId,
          artefact_id: artefact.id,
          proposal_id: artefact.proposal_id ? BigInt(artefact.proposal_id) : null,
          chunk_index: chunk.index,
          content: chunk.content,
          metadata: JSON.stringify(chunk.metadata),
          embedding: JSON.stringify(embedding.embedding),
          embedding_model: this.ollama.getEmbedModel(),
          embedding_dimension: this.ollama.getEmbedDimension(),
          chunking_version: this.chunking.getChunkingVersion(),
        })
        .onConflict((oc) =>
          oc.column('evidence_id').doUpdateSet({
            content: chunk.content,
            metadata: JSON.stringify(chunk.metadata),
            embedding: JSON.stringify(embedding.embedding),
            embedding_model: this.ollama.getEmbedModel(),
            embedding_dimension: this.ollama.getEmbedDimension(),
            chunking_version: this.chunking.getChunkingVersion(),
          }),
        )
        .execute();

      chunksIndexed++;
    }

    const currentIds = chunks.map((chunk) => chunk.evidenceId);
    let stale = this.db.deleteFrom('document_chunks').where('artefact_id', '=', artefact.id);
    if (currentIds.length) stale = stale.where('evidence_id', 'not in', currentIds);
    await stale.execute();
    await this.db.updateTable('artefacts').set({ content: extraction.text }).where('id', '=', artefact.id).execute();

    return {
      artefactEvidenceId: artefact.evidence_id,
      chunksIndexed,
      chunksSkipped,
      errors,
    };
  }

  async indexProposal(proposalId: string): Promise<IndexResult[]> {
    const artefacts = await this.db
      .selectFrom('artefacts')
      .innerJoin('proposal_artefacts', 'proposal_artefacts.evidence_id', 'artefacts.evidence_id')
      .selectAll('artefacts')
      .where('proposal_artefacts.proposal_id', '=', proposalId)
      .where('artefacts.verification_status', '=', 'VERIFIED')
      .where('artefacts.lifecycle_state', '=', 'LINKED')
      .execute();

    const results: IndexResult[] = [];

    for (const artefact of artefacts) {
      const result = await this.indexArtefact(artefact.evidence_id);
      results.push(result);
    }

    return results;
  }
}
