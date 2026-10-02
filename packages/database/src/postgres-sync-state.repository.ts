import type { SyncStateRepository } from "@dao-platform/application";
import { PostgresOperationalDatabase } from "./postgres-operational-database.js";
import {
  normalizeOperationalAddress,
  normalizeOperationalHash,
  operationalUnsignedDecimal,
} from "./postgres-operational-normalization.js";

export class PostgresSyncStateRepository implements SyncStateRepository {
  private readonly chainId: string;
  private readonly contractAddress: string;

  constructor(
    private readonly database: PostgresOperationalDatabase,
    chainId: string,
    contractAddress: string,
    private readonly indexerVersion = "1",
  ) {
    this.chainId = operationalUnsignedDecimal(chainId, "chainId");
    this.contractAddress = normalizeOperationalAddress(contractAddress);
  }

  async getLastProcessedBlock(indexerName: string): Promise<bigint | null> {
    const row = await this.database.executor
      .selectFrom("indexer_checkpoints")
      .select("processed_block_number")
      .where("chain_id", "=", this.chainId)
      .where("contract_address", "=", this.contractAddress)
      .where("indexer_name", "=", indexerName)
      .where("indexer_version", "=", this.indexerVersion)
      .executeTakeFirst();
    return row ? BigInt(row.processed_block_number) : null;
  }

  async setLastProcessedBlock(
    indexerName: string,
    blockNumber: bigint,
  ): Promise<void> {
    await this.setCheckpoint(indexerName, blockNumber, null);
  }

  async setCheckpoint(
    indexerName: string,
    blockNumber: bigint,
    blockHash: string | null,
  ): Promise<void> {
    const updatedAt = new Date();
    const normalizedHash = blockHash === null
      ? null
      : normalizeOperationalHash(blockHash);
    await this.database.executor
      .insertInto("indexer_checkpoints")
      .values({
        chain_id: this.chainId,
        contract_address: this.contractAddress,
        indexer_name: indexerName,
        indexer_version: this.indexerVersion,
        processed_block_number: operationalUnsignedDecimal(
          blockNumber,
          "blockNumber",
        ),
        processed_block_hash: normalizedHash,
        updated_at: updatedAt,
      })
      .onConflict((conflict) =>
        conflict
          .columns([
            "chain_id",
            "contract_address",
            "indexer_name",
            "indexer_version",
          ])
          .doUpdateSet((eb) => ({
            processed_block_number: eb.ref("excluded.processed_block_number"),
            processed_block_hash: eb.ref("excluded.processed_block_hash"),
            updated_at: eb.ref("excluded.updated_at"),
          })),
      )
      .execute();
  }
}
