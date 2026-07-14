import {
  ChainTransactionRepository,
  RecordChainTransactionInput,
} from "@dao-platform/application";
import { SqliteDatabase } from "./sqlite-database.js";

export class SqliteChainTransactionRepository implements ChainTransactionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async record(transaction: RecordChainTransactionInput): Promise<void> {
    await this.database.executor
      .insertInto("chain_transactions")
      .values({
        transaction_hash: transaction.transactionHash,
        operation: transaction.operation,
        proposal_id: transaction.proposalId,
        wallet_address: transaction.walletAddress,
        block_number: transaction.blockNumber,
        block_hash: transaction.blockHash,
        gas_used: transaction.gasUsed,
        status: transaction.status,
        recorded_at: transaction.recordedAt.toISOString(),
      })
      .execute();
  }
}
