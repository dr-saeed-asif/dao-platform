import type {
  AssignmentRepository,
  ProposalAssignmentRecord,
} from "@dao-platform/application";
import { PostgresOperationalDatabase } from "./postgres-operational-database.js";
import {
  normalizeOperationalAddress,
  normalizeOperationalHash,
} from "./postgres-operational-normalization.js";

export interface DetailedProposalAssignment {
  proposalId: string;
  walletAddress: string;
  votingWeight: number;
  transactionHash: string;
  evidenceId: string | null;
  assignedAt: Date;
}

export class PostgresAssignmentRepository implements AssignmentRepository {
  constructor(private readonly database: PostgresOperationalDatabase) {}

  async addMany(records: readonly ProposalAssignmentRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.database.executor
      .insertInto("proposal_assignments")
      .values(
        records.map((record) => ({
          proposal_id: record.proposalId,
          member_address: normalizeOperationalAddress(record.walletAddress),
          assigned: true,
          voting_weight: 1,
          transaction_hash: normalizeOperationalHash(record.transactionHash),
          latest_evidence_id: null,
          effective_from: record.assignedAt,
          updated_at: record.assignedAt,
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(["proposal_id", "member_address"]).doUpdateSet((eb) => ({
          assigned: true,
          voting_weight: 1,
          transaction_hash: eb.ref("excluded.transaction_hash"),
          latest_evidence_id: null,
          effective_from: eb.ref("excluded.effective_from"),
          updated_at: eb.ref("excluded.updated_at"),
        })),
      )
      .execute();
  }

  async remove(proposalId: string, walletAddress: string): Promise<void> {
    const now = new Date();
    await this.database.executor
      .updateTable("proposal_assignments")
      .set({
        assigned: false,
        latest_evidence_id: null,
        effective_from: now,
        updated_at: now,
      })
      .where("proposal_id", "=", proposalId)
      .where(
        "member_address",
        "=",
        normalizeOperationalAddress(walletAddress),
      )
      .execute();
  }

  async applyMembershipEvidence(
    proposalId: string,
    memberAddress: string,
    assigned: boolean,
    evidenceId: string,
  ): Promise<void> {
    const normalizedMember = normalizeOperationalAddress(memberAddress);
    const event = await this.database.executor
      .selectFrom("governance_events")
      .select([
        "event_name",
        "event_args",
        "transaction_hash",
        "block_timestamp",
      ])
      .where("evidence_id", "=", evidenceId)
      .where("canonical", "=", true)
      .executeTakeFirstOrThrow();
    const proposal = await this.database.executor
      .selectFrom("proposals")
      .select("on_chain_id")
      .where("id", "=", proposalId)
      .executeTakeFirstOrThrow();
    const expectedName = assigned ? "MemberAssigned" : "MemberUnassigned";
    const args = event.event_args;
    if (event.event_name !== expectedName || !args || typeof args !== "object" ||
        Array.isArray(args) || args.member !== normalizedMember ||
        args.proposalId !== proposal.on_chain_id) {
      throw new Error(`Evidence ${evidenceId} does not match the membership projection.`);
    }
    await this.database.executor
      .insertInto("proposal_assignments")
      .values({
        proposal_id: proposalId,
        member_address: normalizedMember,
        assigned,
        voting_weight: 1,
        transaction_hash: event.transaction_hash,
        latest_evidence_id: evidenceId,
        effective_from: event.block_timestamp,
        updated_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.columns(["proposal_id", "member_address"]).doUpdateSet((eb) => ({
          assigned,
          voting_weight: 1,
          transaction_hash: eb.ref("excluded.transaction_hash"),
          latest_evidence_id: evidenceId,
          effective_from: eb.ref("excluded.effective_from"),
          updated_at: eb.ref("excluded.updated_at"),
        })),
      )
      .execute();
  }

  async list(proposalId: string): Promise<readonly ProposalAssignmentRecord[]> {
    const rows = await this.database.executor
      .selectFrom("proposal_assignments")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .where("assigned", "=", true)
      .orderBy("member_address")
      .orderBy("effective_from")
      .execute();
    return rows.map((row) => {
      if (!row.transaction_hash || !row.effective_from) {
        throw new Error(`Incomplete current assignment ${row.id}.`);
      }
      return {
        proposalId: row.proposal_id,
        walletAddress: row.member_address,
        transactionHash: row.transaction_hash,
        assignedAt: row.effective_from,
      };
    });
  }

  async listDetailed(proposalId: string): Promise<readonly DetailedProposalAssignment[]> {
    const rows = await this.database.executor
      .selectFrom("proposal_assignments")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .where("assigned", "=", true)
      .orderBy("member_address")
      .orderBy("effective_from")
      .execute();
    return rows.map((row) => {
      if (!row.transaction_hash || !row.effective_from) {
        throw new Error(`Incomplete current assignment ${row.id}.`);
      }
      return {
        proposalId: row.proposal_id,
        walletAddress: row.member_address,
        votingWeight: row.voting_weight,
        transactionHash: row.transaction_hash,
        evidenceId: row.latest_evidence_id,
        assignedAt: row.effective_from,
      };
    });
  }

  async findDetailed(proposalId: string, walletAddress: string): Promise<(DetailedProposalAssignment & { assigned: boolean }) | null> {
    const row = await this.database.executor
      .selectFrom('proposal_assignments')
      .selectAll()
      .where('proposal_id', '=', proposalId)
      .where('member_address', '=', normalizeOperationalAddress(walletAddress))
      .executeTakeFirst();
    if (!row) return null;
    if (!row.transaction_hash || !row.effective_from) throw new Error(`Incomplete assignment ${row.id}.`);
    return {
      proposalId: row.proposal_id,
      walletAddress: row.member_address,
      votingWeight: row.voting_weight,
      transactionHash: row.transaction_hash,
      evidenceId: row.latest_evidence_id,
      assignedAt: row.effective_from,
      assigned: row.assigned,
    };
  }
}
