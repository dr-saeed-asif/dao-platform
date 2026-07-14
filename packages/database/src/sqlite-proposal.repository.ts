import {
  ProposalRepository,
  SaveProposalOptions,
} from "@dao-platform/application";
import {
  Proposal,
  ProposalMetadata,
  ProposalStatus,
  ProposalType,
} from "@dao-platform/domain";
import { ProposalsTable } from "./database-schema.js";
import { SqliteDatabase } from "./sqlite-database.js";

export class SqliteProposalRepository implements ProposalRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async findById(id: string): Promise<Proposal | null> {
    const row = await this.database.executor
      .selectFrom("proposals")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.hydrate(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Proposal | null> {
    const row = await this.database.executor
      .selectFrom("proposals")
      .selectAll()
      .where("idempotency_key", "=", key)
      .executeTakeFirst();
    return row ? this.hydrate(row) : null;
  }

  async list(limit: number, offset: number): Promise<readonly Proposal[]> {
    const rows = await this.database.executor
      .selectFrom("proposals")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async insert(
    proposal: Proposal,
    options: SaveProposalOptions,
  ): Promise<void> {
    await this.database.executor
      .insertInto("proposals")
      .values({
        id: proposal.id,
        dao_id: proposal.daoId,
        idempotency_key: options.idempotencyKey,
        on_chain_id: proposal.onChainId,
        creator_address: proposal.creatorAddress.value,
        title: proposal.title,
        purpose: proposal.purpose,
        description: proposal.description,
        proposal_type: proposal.type,
        status: proposal.status,
        starts_at: proposal.startsAt.toISOString(),
        ends_at: proposal.endsAt.toISOString(),
        metadata_json: JSON.stringify(proposal.metadata),
        created_at: proposal.createdAt.toISOString(),
        updated_at: proposal.updatedAt.toISOString(),
      })
      .execute();

    await this.database.executor
      .insertInto("proposal_options")
      .values(
        proposal.options.map((option) => ({
          proposal_id: proposal.id,
          option_index: option.index,
          label: option.label,
        })),
      )
      .execute();
  }

  async markPublished(
    id: string,
    onChainId: string,
    status: ProposalStatus,
    updatedAt: Date,
  ): Promise<void> {
    await this.database.executor
      .updateTable("proposals")
      .set({
        on_chain_id: onChainId,
        status,
        updated_at: updatedAt.toISOString(),
      })
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  private async hydrate(row: ProposalsTable): Promise<Proposal> {
    const optionRows = await this.database.executor
      .selectFrom("proposal_options")
      .select(["option_index", "label"])
      .where("proposal_id", "=", row.id)
      .orderBy("option_index")
      .execute();

    return Proposal.rehydrate({
      id: row.id,
      daoId: row.dao_id,
      creatorAddress: row.creator_address,
      title: row.title,
      purpose: row.purpose,
      description: row.description,
      type: row.proposal_type as ProposalType,
      optionLabels: optionRows.map((option) => option.label),
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      metadata: JSON.parse(row.metadata_json) as ProposalMetadata,
      status: row.status as ProposalStatus,
      onChainId: row.on_chain_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
