import {
  AssignmentRepository,
  ProposalAssignmentRecord,
} from "@dao-platform/application";
import { SqliteDatabase } from "./sqlite-database.js";

export class SqliteAssignmentRepository implements AssignmentRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async addMany(records: readonly ProposalAssignmentRecord[]): Promise<void> {
    await this.database.executor
      .insertInto("proposal_assignments")
      .values(
        records.map((record) => ({
          proposal_id: record.proposalId,
          wallet_address: record.walletAddress,
          transaction_hash: record.transactionHash,
          assigned_at: record.assignedAt.toISOString(),
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(["proposal_id", "wallet_address"]).doUpdateSet((eb) => ({
          transaction_hash: eb.ref("excluded.transaction_hash"),
          assigned_at: eb.ref("excluded.assigned_at"),
        })),
      )
      .execute();
  }

  async remove(proposalId: string, walletAddress: string): Promise<void> {
    await this.database.executor
      .deleteFrom("proposal_assignments")
      .where("proposal_id", "=", proposalId)
      .where("wallet_address", "=", walletAddress)
      .execute();
  }

  async list(proposalId: string): Promise<readonly ProposalAssignmentRecord[]> {
    const rows = await this.database.executor
      .selectFrom("proposal_assignments")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .orderBy("assigned_at")
      .execute();
    return rows.map((row) => ({
      proposalId: row.proposal_id,
      walletAddress: row.wallet_address,
      transactionHash: row.transaction_hash,
      assignedAt: new Date(row.assigned_at),
    }));
  }
}
