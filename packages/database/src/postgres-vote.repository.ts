import type { VoteRecord, VoteRepository } from "@dao-platform/application";
import { PostgresOperationalDatabase } from "./postgres-operational-database.js";
import {
  normalizeOperationalAddress,
  normalizeOperationalHash,
  operationalUnsignedDecimal,
} from "./postgres-operational-normalization.js";
import type { ProposalVoteDetail } from './proposal-votes.types.js';

export class PostgresVoteRepository implements VoteRepository {
  constructor(private readonly database: PostgresOperationalDatabase) {}

  async findByProposalAndVoter(
    proposalId: string,
    voterAddress: string,
  ): Promise<VoteRecord | null> {
    const row = await this.database.executor
      .selectFrom("votes")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .where("voter_address", "=", normalizeOperationalAddress(voterAddress))
      .executeTakeFirst();
    return row ? mapVote(row) : null;
  }

  async upsert(vote: VoteRecord): Promise<void> {
    const voterAddress = normalizeOperationalAddress(vote.voterAddress);
    const transactionHash = normalizeOperationalHash(vote.transactionHash);
    const blockHash = normalizeOperationalHash(vote.blockHash);
    const blockNumber = operationalUnsignedDecimal(vote.blockNumber, "blockNumber");
    const onChainProposalId = operationalUnsignedDecimal(
      vote.onChainProposalId,
      "onChainProposalId",
    );
    const event = await this.findVoteEvidence(
      vote.proposalId,
      onChainProposalId,
      voterAddress,
      vote.optionIndex,
      transactionHash,
      blockNumber,
      blockHash,
    );

    await this.database.executor
      .insertInto("votes")
      .values({
        proposal_id: vote.proposalId,
        on_chain_proposal_id: onChainProposalId,
        voter_address: voterAddress,
        option_index: vote.optionIndex,
        voting_weight: 1,
        evidence_id: event.evidence_id,
        transaction_hash: transactionHash,
        block_number: blockNumber,
        block_hash: blockHash,
        block_timestamp: event.block_timestamp,
        gas_used: operationalUnsignedDecimal(vote.gasUsed, "gasUsed"),
        created_at: vote.confirmedAt,
      })
      .onConflict((conflict) =>
        conflict.columns(["proposal_id", "voter_address"]).doNothing(),
      )
      .execute();

    const stored = await this.database.executor
      .selectFrom("votes")
      .select(["evidence_id", "option_index", "transaction_hash"])
      .where("proposal_id", "=", vote.proposalId)
      .where("voter_address", "=", voterAddress)
      .executeTakeFirstOrThrow();
    if (stored.evidence_id !== event.evidence_id ||
        stored.option_index !== vote.optionIndex ||
        stored.transaction_hash !== transactionHash) {
      throw new Error("A different successful vote already exists for this proposal and voter.");
    }
  }

  async list(proposalId: string): Promise<readonly VoteRecord[]> {
    const rows = await this.database.executor
      .selectFrom("votes")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .orderBy("block_timestamp")
      .execute();
    return rows.map(mapVote);
  }

  async listDetailed(proposalId: string): Promise<readonly ProposalVoteDetail[]> {
    const rows = await this.database.executor
      .selectFrom("votes")
      .leftJoin("chain_transactions", (join) => join
        .onRef("chain_transactions.proposal_id", "=", "votes.proposal_id")
        .onRef("chain_transactions.transaction_hash", "=", "votes.transaction_hash"))
      .select([
        "votes.voter_address",
        "votes.option_index",
        "votes.voting_weight",
        "votes.transaction_hash",
        "votes.block_number",
        "votes.block_hash",
        "votes.block_timestamp",
        "votes.gas_used",
        "votes.created_at",
        "votes.evidence_id",
        "chain_transactions.sender as transaction_sender",
      ])
      .where("votes.proposal_id", "=", proposalId)
      .orderBy("votes.block_timestamp")
      .orderBy("votes.transaction_hash")
      .execute();
    return rows.map((row) => ({
      voterAddress: row.voter_address,
      transactionSender: row.transaction_sender,
      optionIndex: row.option_index,
      optionLabel: null,
      votingPower: row.voting_weight,
      transactionHash: row.transaction_hash,
      blockNumber: row.block_number,
      blockHash: row.block_hash,
      blockTimestamp: row.block_timestamp.toISOString(),
      gasUsed: row.gas_used,
      confirmedAt: row.created_at.toISOString(),
      evidenceId: row.evidence_id,
    }));
  }

  private async findVoteEvidence(
    proposalId: string,
    onChainProposalId: string,
    voterAddress: string,
    optionIndex: number,
    transactionHash: string,
    blockNumber: string,
    blockHash: string,
  ) {
    const proposal = await this.database.executor
      .selectFrom("proposals")
      .select(["chain_id", "contract_address", "on_chain_id"])
      .where("id", "=", proposalId)
      .executeTakeFirstOrThrow();
    if (proposal.on_chain_id !== onChainProposalId) {
      throw new Error("Vote on-chain proposal ID does not match its proposal.");
    }
    const candidates = await this.database.executor
      .selectFrom("governance_events")
      .select([
        "evidence_id",
        "event_args",
        "block_number",
        "block_hash",
        "block_timestamp",
      ])
      .where("chain_id", "=", proposal.chain_id)
      .where("contract_address", "=", proposal.contract_address)
      .where("transaction_hash", "=", transactionHash)
      .where("event_name", "=", "VoteCast")
      .where("canonical", "=", true)
      .execute();
    const event = candidates.find((candidate) => {
      const args = candidate.event_args;
      return args !== null && typeof args === "object" && !Array.isArray(args) &&
        args.proposalId === onChainProposalId &&
        args.voter === voterAddress &&
        args.optionIndex === optionIndex.toString();
    });
    if (!event || event.block_number !== blockNumber || event.block_hash !== blockHash) {
      throw new Error("A matching canonical VoteCast evidence event is required.");
    }
    return event;
  }
}

function mapVote(row: {
  proposal_id: string;
  on_chain_proposal_id: string;
  voter_address: string;
  option_index: number;
  transaction_hash: string;
  block_number: string;
  block_hash: string;
  gas_used: string | null;
  created_at: Date;
}): VoteRecord {
  if (row.gas_used === null) throw new Error("Operational vote gas_used is missing.");
  return {
    proposalId: row.proposal_id,
    onChainProposalId: row.on_chain_proposal_id,
    voterAddress: row.voter_address,
    optionIndex: row.option_index,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    blockHash: row.block_hash,
    gasUsed: row.gas_used,
    confirmedAt: row.created_at,
  };
}
