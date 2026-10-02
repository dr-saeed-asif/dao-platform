import { Kysely, sql } from 'kysely';
import type { PostgresDatabaseSchema } from '../postgres-database-schema.js';

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema.createTable('proposal_artefacts')
    .addColumn('proposal_id', 'text', c => c.notNull().references('proposals.id').onDelete('cascade'))
    .addColumn('evidence_id', 'text', c => c.notNull().references('artefacts.evidence_id'))
    .addColumn('creation_evidence_id', 'text', c => c.notNull().references('governance_events.evidence_id'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint('proposal_artefacts_pk', ['proposal_id', 'evidence_id']).execute();
  await sql`DELETE FROM provenance_edges a USING provenance_edges b
    WHERE a.dataset_version_id IS NULL AND b.dataset_version_id IS NULL AND a.id > b.id
      AND a.from_evidence_id = b.from_evidence_id AND a.to_evidence_id = b.to_evidence_id AND a.relation_type = b.relation_type`.execute(db);
  await sql`CREATE UNIQUE INDEX provenance_edges_live_identity_uq ON provenance_edges
    (from_evidence_id, to_evidence_id, relation_type) WHERE dataset_version_id IS NULL`.execute(db);
}
export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema.dropTable('proposal_artefacts').execute();
  await db.schema.dropIndex('provenance_edges_live_identity_uq').execute();
}
