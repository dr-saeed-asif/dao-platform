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
      .onConflict((conflict) => conflict.column("transaction_hash").doNothing())
      .execute();
  }

  async listForProposal(
    proposalId: string,
  ): Promise<readonly RecordChainTransactionInput[]> {
    const rows = await this.database.executor
      .selectFrom("chain_transactions")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .orderBy("recorded_at", "desc")
      .execute();
    return rows.map((row) => ({
      transactionHash: row.transaction_hash,
      operation: row.operation as RecordChainTransactionInput["operation"],
      proposalId: row.proposal_id,
      walletAddress: row.wallet_address,
      blockNumber: row.block_number,
      blockHash: row.block_hash,
      gasUsed: row.gas_used,
      status: "CONFIRMED",
      recordedAt: new Date(row.recorded_at),
    }));
  }
}
