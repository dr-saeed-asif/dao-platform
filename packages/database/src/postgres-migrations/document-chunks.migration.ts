import { Kysely, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  await db.schema
    .createTable("document_chunks")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("evidence_id", "text", (column) => column.notNull())
    .addColumn("artefact_id", "bigint", (column) =>
      column.notNull().references("artefacts.id").onDelete("cascade"),
    )
    .addColumn("proposal_id", sql`numeric(78,0)`)
    .addColumn("chunk_index", "integer", (column) => column.notNull())
    .addColumn("content", "text", (column) => column.notNull())
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("embedding", sql`vector(1024)`)
    .addColumn("embedding_model", "text", (column) => column.notNull())
    .addColumn("embedding_dimension", "integer", (column) => column.notNull())
    .addColumn("chunking_version", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("document_chunks_evidence_id_uq", ["evidence_id"])
    .addCheckConstraint(
      "document_chunks_embedding_dimension_ck",
      sql`embedding_dimension > 0`,
    )
    .addCheckConstraint(
      "document_chunks_chunk_index_ck",
      sql`chunk_index >= 0`,
    )
    .execute();

  await db.schema
    .createIndex("document_chunks_proposal_idx")
    .on("document_chunks")
    .column("proposal_id")
    .where("proposal_id", "is not", null)
    .execute();

  await db.schema
    .createIndex("document_chunks_artefact_idx")
    .on("document_chunks")
    .column("artefact_id")
    .execute();

  await sql`CREATE INDEX document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops)`.execute(db);
}

export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema.dropIndex("document_chunks_embedding_idx").ifExists().execute();
  await db.schema.dropIndex("document_chunks_artefact_idx").ifExists().execute();
  await db.schema.dropIndex("document_chunks_proposal_idx").ifExists().execute();
  await db.schema.dropTable("document_chunks").ifExists().execute();
}
