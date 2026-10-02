import type {
  ChainTransactionRepository,
  RecordChainTransactionInput,
} from "@dao-platform/application";
import { PostgresOperationalDatabase } from "./postgres-operational-database.js";
import {
  normalizeOperationalAddress,
  normalizeOperationalHash,
  operationalUnsignedDecimal,
} from "./postgres-operational-normalization.js";

export class PostgresChainTransactionRepository
  implements ChainTransactionRepository
{
  private readonly chainId: string;
  private readonly recipient: string | null;

  constructor(
    private readonly database: PostgresOperationalDatabase,
    chainId: string,
    recipient?: string,
  ) {
    this.chainId = operationalUnsignedDecimal(chainId, "chainId");
    this.recipient = recipient
      ? normalizeOperationalAddress(recipient)
      : null;
  }

  async record(transaction: RecordChainTransactionInput): Promise<void> {
    const transactionHash = normalizeOperationalHash(transaction.transactionHash);
    const event = await this.database.executor
      .selectFrom("governance_events")
      .select(["transaction_sender", "contract_address", "transaction_index"])
      .where("chain_id", "=", this.chainId)
      .where("transaction_hash", "=", transactionHash)
      .where("canonical", "=", true)
      .orderBy("log_index")
      .executeTakeFirst();
    await this.database.executor
      .insertInto("chain_transactions")
      .values({
        chain_id: this.chainId,
        transaction_hash: transactionHash,
        proposal_id: transaction.proposalId,
        sender: event?.transaction_sender ??
          normalizeOperationalAddress(transaction.walletAddress),
        recipient: event?.contract_address ?? this.recipient,
        block_number: operationalUnsignedDecimal(
          transaction.blockNumber,
          "blockNumber",
        ),
        block_hash: normalizeOperationalHash(transaction.blockHash),
        transaction_index: event?.transaction_index ?? null,
        receipt_status: transaction.status,
        gas_used: operationalUnsignedDecimal(transaction.gasUsed, "gasUsed"),
        operation: transaction.operation,
        created_at: transaction.recordedAt,
        updated_at: transaction.recordedAt,
      })
      .onConflict((conflict) =>
        conflict.columns(["chain_id", "transaction_hash"]).doNothing(),
      )
      .execute();
  }

  async listForProposal(
    proposalId: string,
  ): Promise<readonly RecordChainTransactionInput[]> {
    const rows = await this.database.executor
      .selectFrom("chain_transactions")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => {
      if (!row.proposal_id || !row.block_number || !row.block_hash ||
          !row.gas_used || !row.operation) {
        throw new Error(`Incomplete confirmed chain transaction ${row.id}.`);
      }
      return {
        transactionHash: row.transaction_hash,
        operation: row.operation as RecordChainTransactionInput["operation"],
        proposalId: row.proposal_id,
        walletAddress: row.sender,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        gasUsed: row.gas_used,
        status: "CONFIRMED",
        recordedAt: row.created_at,
      };
    });
  }
}
