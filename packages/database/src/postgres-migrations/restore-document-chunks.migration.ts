import { Kysely, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);
  await sql`
    CREATE TABLE IF NOT EXISTS public.document_chunks (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      evidence_id text NOT NULL UNIQUE,
      artefact_id bigint NOT NULL REFERENCES public.artefacts(id) ON DELETE CASCADE,
      proposal_id numeric(78,0),
      chunk_index integer NOT NULL CHECK (chunk_index >= 0),
      content text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      embedding vector(1024),
      embedding_model text NOT NULL,
      embedding_dimension integer NOT NULL CHECK (embedding_dimension > 0),
      chunking_version text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS document_chunks_proposal_idx ON public.document_chunks(proposal_id) WHERE proposal_id IS NOT NULL`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS document_chunks_artefact_idx ON public.document_chunks(artefact_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON public.document_chunks USING hnsw (embedding vector_cosine_ops)`.execute(db);
}

export async function down(_db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  // Recovery migration is intentionally non-destructive; existing indexed evidence must be preserved.
}
