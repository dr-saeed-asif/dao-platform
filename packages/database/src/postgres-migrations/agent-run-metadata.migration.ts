import { Kysely, sql } from 'kysely';
import type { PostgresDatabaseSchema } from '../postgres-database-schema.js';
export async function up(db:Kysely<PostgresDatabaseSchema>){await sql`ALTER TABLE experiment_runs ALTER COLUMN dataset_version_id DROP NOT NULL; ALTER TABLE questions ALTER COLUMN dataset_version_id DROP NOT NULL`.execute(db);}
export async function down(db:Kysely<PostgresDatabaseSchema>){await sql`ALTER TABLE experiment_runs ALTER COLUMN dataset_version_id SET NOT NULL; ALTER TABLE questions ALTER COLUMN dataset_version_id SET NOT NULL`.execute(db);}
