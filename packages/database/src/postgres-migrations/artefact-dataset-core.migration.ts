import { Kysely, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await sql`ALTER TABLE dataset_versions
    ADD COLUMN chain_id numeric(78,0),
    ADD COLUMN contract_address text,
    ADD COLUMN start_block numeric(78,0),
    ADD COLUMN end_block numeric(78,0),
    ADD COLUMN end_block_hash text,
    ADD COLUMN policy_version text,
    ADD COLUMN status text NOT NULL DEFAULT 'OPEN',
    ADD COLUMN frozen_at timestamptz,
    ADD CONSTRAINT dataset_versions_status_ck CHECK (status IN ('OPEN','FROZEN'))`.execute(db);
  await sql`ALTER TABLE artefacts ALTER COLUMN dataset_version_id DROP NOT NULL,
    ADD COLUMN filename text,
    ADD COLUMN media_type text,
    ADD COLUMN byte_size bigint,
    ADD COLUMN storage_key text,
    ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'STAGED',
    ADD COLUMN local_proposal_id text,
    ADD CONSTRAINT artefacts_lifecycle_ck CHECK (lifecycle_state IN ('STAGED','PENDING_CHAIN','LINKED','FAILED','ORPHANED'))`.execute(db);
  await db.schema.createIndex("artefacts_local_proposal_idx").on("artefacts")
    .column("local_proposal_id").where("local_proposal_id", "is not", null).execute();
  await sql`ALTER TABLE provenance_edges ALTER COLUMN dataset_version_id DROP NOT NULL`.execute(db);
}

export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema.dropIndex("artefacts_local_proposal_idx").ifExists().execute();
  await sql`ALTER TABLE provenance_edges ALTER COLUMN dataset_version_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE artefacts DROP CONSTRAINT IF EXISTS artefacts_lifecycle_ck,
    DROP COLUMN IF EXISTS local_proposal_id, DROP COLUMN IF EXISTS lifecycle_state,
    DROP COLUMN IF EXISTS storage_key, DROP COLUMN IF EXISTS byte_size,
    DROP COLUMN IF EXISTS media_type, DROP COLUMN IF EXISTS filename,
    ALTER COLUMN dataset_version_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE dataset_versions DROP CONSTRAINT IF EXISTS dataset_versions_status_ck,
    DROP COLUMN IF EXISTS frozen_at, DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS policy_version, DROP COLUMN IF EXISTS end_block_hash,
    DROP COLUMN IF EXISTS end_block, DROP COLUMN IF EXISTS start_block,
    DROP COLUMN IF EXISTS contract_address, DROP COLUMN IF EXISTS chain_id`.execute(db);
}
