import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import {
  Kysely,
  Migrator,
  Migration,
  MigrationProvider,
  SqliteDialect,
  Transaction,
} from "kysely";
import {
  GovernanceReadModelReset,
  TransactionManager,
} from "@dao-platform/application";
import { DatabaseSchema } from "./database-schema.js";
import * as initialMigration from "./migrations/initial.migration.js";
import * as governanceRecordsMigration from "./migrations/governance-records.migration.js";
import * as votingIndexerMigration from "./migrations/voting-indexer.migration.js";

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "001_initial": initialMigration,
      "002_governance_records": governanceRecordsMigration,
      "003_voting_indexer": votingIndexerMigration,
    };
  }
}

export class SqliteDatabase
  implements TransactionManager, GovernanceReadModelReset
{
  private readonly context = new AsyncLocalStorage<
    Transaction<DatabaseSchema>
  >();
  readonly db: Kysely<DatabaseSchema>;
  readonly filename: string;

  constructor(databaseUrl: string, baseDirectory = process.cwd()) {
    this.filename = sqliteFilename(databaseUrl, baseDirectory);
    mkdirSync(dirname(this.filename), { recursive: true });
    const sqlite = new Database(this.filename);
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("journal_mode = WAL");
    this.db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: sqlite }),
    });
  }

  get executor(): Kysely<DatabaseSchema> | Transaction<DatabaseSchema> {
    return this.context.getStore() ?? this.db;
  }

  async migrateToLatest(): Promise<void> {
    const migrator = new Migrator({
      db: this.db,
      provider: new StaticMigrationProvider(),
    });
    const result = await migrator.migrateToLatest();
    if (result.error) throw result.error;
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    return this.db
      .transaction()
      .execute((transaction) => this.context.run(transaction, work));
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }

  async clearGovernanceData(): Promise<void> {
    await this.runInTransaction(async () => {
      const executor = this.executor;
      await executor.deleteFrom("votes").execute();
      await executor.deleteFrom("chain_transactions").execute();
      await executor.deleteFrom("proposal_assignments").execute();
      await executor.deleteFrom("proposal_options").execute();
      await executor.deleteFrom("proposals").execute();
      await executor.deleteFrom("indexer_state").execute();
    });
  }
}

function sqliteFilename(databaseUrl: string, baseDirectory: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("SQLite DATABASE_URL must start with file:.");
  }
  const filename = databaseUrl.slice("file:".length);
  if (!filename) throw new Error("SQLite DATABASE_URL must include a path.");
  return isAbsolute(filename) ? filename : resolve(baseDirectory, filename);
}
