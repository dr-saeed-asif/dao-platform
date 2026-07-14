import { VoteRecord, VoteRepository } from "@dao-platform/application";
import { VotesTable } from "./database-schema.js";
import { SqliteDatabase } from "./sqlite-database.js";

export class SqliteVoteRepository implements VoteRepository {
  constructor(private readonly database: SqliteDatabase) {}
  async findByProposalAndVoter(proposalId: string, voterAddress: string) {
    const row = await this.database.executor
      .selectFrom("votes")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .where("voter_address", "=", voterAddress)
      .executeTakeFirst();
    return row ? mapVote(row) : null;
  }
  async upsert(vote: VoteRecord): Promise<void> {
    await this.database.executor
      .insertInto("votes")
      .values({
        proposal_id: vote.proposalId,
        on_chain_proposal_id: vote.onChainProposalId,
        voter_address: vote.voterAddress,
        option_index: vote.optionIndex,
        transaction_hash: vote.transactionHash,
        block_number: vote.blockNumber,
        block_hash: vote.blockHash,
        gas_used: vote.gasUsed,
        confirmed_at: vote.confirmedAt.toISOString(),
      })
      .onConflict((conflict) =>
        conflict.columns(["proposal_id", "voter_address"]).doUpdateSet({
          transaction_hash: vote.transactionHash,
          block_number: vote.blockNumber,
          block_hash: vote.blockHash,
          gas_used: vote.gasUsed,
          option_index: vote.optionIndex,
          confirmed_at: vote.confirmedAt.toISOString(),
        }),
      )
      .execute();
  }
  async list(proposalId: string): Promise<readonly VoteRecord[]> {
    const rows = await this.database.executor
      .selectFrom("votes")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .orderBy("confirmed_at")
      .execute();
    return rows.map(mapVote);
  }
}

function mapVote(row: VotesTable): VoteRecord {
  return {
    proposalId: row.proposal_id,
    onChainProposalId: row.on_chain_proposal_id,
    voterAddress: row.voter_address,
    optionIndex: row.option_index,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    blockHash: row.block_hash,
    gasUsed: row.gas_used,
    confirmedAt: new Date(row.confirmed_at),
  };
}
