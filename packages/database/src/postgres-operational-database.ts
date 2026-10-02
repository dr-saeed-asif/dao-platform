import { AsyncLocalStorage } from "node:async_hooks";
import type {
  GovernanceReadModelReset,
  TransactionManager,
} from "@dao-platform/application";
import type { Kysely, Transaction } from "kysely";
import type { PostgresDatabase } from "./postgres-database.js";
import type { PostgresDatabaseSchema } from "./postgres-database-schema.js";

export class PostgresOperationalDatabase
  implements TransactionManager, GovernanceReadModelReset
{
  private readonly context = new AsyncLocalStorage<
    Transaction<PostgresDatabaseSchema>
  >();

  constructor(readonly db: PostgresDatabase) {}

  get executor():
    | Kysely<PostgresDatabaseSchema>
    | Transaction<PostgresDatabaseSchema> {
    return this.context.getStore() ?? this.db;
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    return this.db
      .transaction()
      .execute((transaction) => this.context.run(transaction, work));
  }

  async clearGovernanceData(): Promise<void> {
    await this.runInTransaction(async () => {
      const executor = this.executor;
      await executor.deleteFrom("votes").execute();
      await executor.deleteFrom("chain_transactions").execute();
      await executor.deleteFrom("proposal_assignments").execute();
      await executor.deleteFrom("proposal_options").execute();
      await executor.deleteFrom("proposals").execute();
      await executor.deleteFrom("indexer_checkpoints").execute();
    });
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }
}
