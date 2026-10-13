import {
  Kysely,
  Migration,
  MigrationProvider,
  Migrator,
  PostgresDialect,
  sql,
} from "kysely";
import { Pool } from "pg";
import type { PostgresDatabaseSchema } from "./postgresql-table.types.js";
import * as researchProvenanceMigration from "./schema-migrations/research-evidence-provenance.migration.js";
import * as contractDeployment1212Migration from "./schema-migrations/governance-contract-deployment-1212.migration.js";
import * as operationalDaoMigration from "./schema-migrations/governance-operational-tables.migration.js";
import * as artefactDatasetCoreMigration from "./schema-migrations/research-documents-and-datasets.migration.js";
import * as proposalArtefactLinksMigration from "./schema-migrations/proposal-document-evidence-links.migration.js";
import * as documentChunksMigration from "./schema-migrations/document-text-chunks-and-embeddings.migration.js";
import * as agentRunMetadataMigration from "./schema-migrations/model-agent-execution-metadata.migration.js";

export type PostgresDatabase = Kysely<PostgresDatabaseSchema>;

class PostgresMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "001_research_provenance": researchProvenanceMigration,
      "002_contract_deployment_1212": contractDeployment1212Migration,
      "003_operational_dao": operationalDaoMigration,
      "004_artefact_dataset_core": artefactDatasetCoreMigration,
      "005_proposal_artefact_links": proposalArtefactLinksMigration,
      "006_document_chunks": documentChunksMigration,
      "007_agent_run_metadata": agentRunMetadataMigration,
    };
  }
}

/** Creates a lazy connection pool. The caller owns shutdown via db.destroy(). */
export function createPostgresDatabase(postgresUrl: string): PostgresDatabase {
  if (!postgresUrl?.trim()) {
    throw new Error("POSTGRES_URL is required to create a PostgreSQL connection.");
  }
  return new Kysely<PostgresDatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: postgresUrl,
        connectionTimeoutMillis: 5000,
      }),
    }),
  });
}

export async function migratePostgresToLatest(
  database: PostgresDatabase,
): Promise<void> {
  const migrator = new Migrator({
    db: database,
    provider: new PostgresMigrationProvider(),
  });
  const result = await migrator.migrateToLatest();
  if (result.error) throw result.error;
}

/** Rejects on connectivity failure; does not run migrations or create tables. */
export async function checkPostgresConnection(
  database: PostgresDatabase,
): Promise<void> {
  await sql`SELECT 1`.execute(database);
}
