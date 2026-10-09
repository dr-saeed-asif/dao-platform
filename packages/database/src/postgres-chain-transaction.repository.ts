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

export interface DetailedChainTransaction {
  transactionHash: string;
  operation: string;
  proposalId: string;
  sender: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex: number | null;
  gasUsed: string;
  status: string;
  recordedAt: Date;
}

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
    const rows = await this.listForProposalDetailed(proposalId);
    return rows.map((row) => ({
      transactionHash: row.transactionHash,
      operation: row.operation as RecordChainTransactionInput["operation"],
      proposalId: row.proposalId,
      walletAddress: row.sender,
      blockNumber: row.blockNumber,
      blockHash: row.blockHash,
      gasUsed: row.gasUsed,
      status: "CONFIRMED",
      recordedAt: row.recordedAt,
    }));
  }

  async listForProposalDetailed(
    proposalId: string,
  ): Promise<readonly DetailedChainTransaction[]> {
    const rows = await this.database.executor
      .selectFrom("chain_transactions")
      .selectAll()
      .where("chain_id", "=", this.chainId)
      .where("proposal_id", "=", proposalId)
      .where((eb) => this.recipient === null
        ? eb.val(true)
        : eb("recipient", "=", this.recipient))
      .orderBy("block_number", "desc")
      .orderBy("transaction_index", "asc")
      .orderBy("transaction_hash", "asc")
      .execute();
    return rows.map((row) => {
      if (!row.proposal_id || !row.block_number || !row.block_hash ||
          !row.gas_used || !row.operation) {
        throw new Error(`Incomplete confirmed chain transaction ${row.id}.`);
      }
      return {
        transactionHash: row.transaction_hash,
        operation: row.operation,
        proposalId: row.proposal_id,
        sender: row.sender,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        transactionIndex: row.transaction_index === null ? null : safeIndex(row.transaction_index),
        gasUsed: row.gas_used,
        status: row.receipt_status,
        recordedAt: row.created_at,
      };
    });
  }
}

function safeIndex(value: string | bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('Transaction index is outside the supported exact integer range.');
  }
  return number;
}
