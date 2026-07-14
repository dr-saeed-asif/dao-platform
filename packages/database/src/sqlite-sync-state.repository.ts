import { SyncStateRepository } from "@dao-platform/application";
import { SqliteDatabase } from "./sqlite-database.js";

export class SqliteSyncStateRepository implements SyncStateRepository {
  constructor(private readonly database: SqliteDatabase) {}
  async getLastProcessedBlock(indexerName: string): Promise<bigint | null> {
    const row = await this.database.executor
      .selectFrom("indexer_state")
      .select("last_processed_block")
      .where("indexer_name", "=", indexerName)
      .executeTakeFirst();
    return row ? BigInt(row.last_processed_block) : null;
  }
  async setLastProcessedBlock(
    indexerName: string,
    blockNumber: bigint,
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.database.executor
      .insertInto("indexer_state")
      .values({
        indexer_name: indexerName,
        last_processed_block: blockNumber.toString(),
        updated_at: updatedAt,
      })
      .onConflict((conflict) =>
        conflict.column("indexer_name").doUpdateSet({
          last_processed_block: blockNumber.toString(),
          updated_at: updatedAt,
        }),
      )
      .execute();
  }
}
