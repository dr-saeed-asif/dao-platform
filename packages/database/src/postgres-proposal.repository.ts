import type {
  ProposalRepository,
  SaveProposalOptions,
} from "@dao-platform/application";
import {
  Proposal,
  ProposalMetadata,
  ProposalStatus,
  ProposalType,
} from "@dao-platform/domain";
import type { Selectable } from "kysely";
import type { OperationalProposalsTable } from "./postgres-database-schema.js";
import { PostgresOperationalDatabase } from "./postgres-operational-database.js";
import { linkProposalManifest } from './proposal-manifest.js';
import {
  normalizeOperationalAddress,
  normalizeOperationalHash,
  operationalUnsignedDecimal,
} from "./postgres-operational-normalization.js";

export class PostgresProposalRepository implements ProposalRepository {
  private readonly chainId: string;
  private readonly contractAddress: string;

  constructor(
    private readonly database: PostgresOperationalDatabase,
    chainId: string,
    contractAddress: string,
  ) {
    this.chainId = operationalUnsignedDecimal(chainId, "chainId");
    this.contractAddress = normalizeOperationalAddress(contractAddress);
  }

  async findById(id: string): Promise<Proposal | null> {
    const row = await this.database.executor
      .selectFrom("proposals")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.hydrate(row) : null;
  }

  async findByOnChainId(onChainId: string): Promise<Proposal | null> {
    const row = await this.database.executor
      .selectFrom("proposals")
      .selectAll()
      .where("chain_id", "=", this.chainId)
      .where("contract_address", "=", this.contractAddress)
      .where(
        "on_chain_id",
        "=",
        operationalUnsignedDecimal(onChainId, "onChainId"),
      )
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

  async findDraftByMetadataHash(metadataHash: string, creatorAddress: string): Promise<Proposal | null> {
    const row = await this.database.executor.selectFrom('proposals').selectAll()
      .where('chain_id', '=', this.chainId).where('contract_address', '=', this.contractAddress)
      .where('on_chain_id', 'is', null).where('metadata_hash', '=', normalizeOperationalHash(metadataHash))
      .where('creator_address', '=', normalizeOperationalAddress(creatorAddress)).orderBy('created_at').executeTakeFirst();
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
    const metadataUri = metadataString(proposal.metadata, "metadataURI");
    const metadataHashValue = metadataString(proposal.metadata, "metadataHash");
    const metadataHash = metadataHashValue
      ? normalizeOperationalHash(metadataHashValue)
      : null;
    const onChainId = proposal.onChainId === null
      ? null
      : operationalUnsignedDecimal(proposal.onChainId, "onChainId");
    const creationEvidenceId = onChainId === null
      ? null
      : await this.findCreationEvidenceId(onChainId);

    await this.database.executor
      .insertInto("proposals")
      .values({
        id: proposal.id,
        dao_id: proposal.daoId,
        idempotency_key: options.idempotencyKey,
        on_chain_id: onChainId,
        chain_id: this.chainId,
        contract_address: this.contractAddress,
        creator_address: normalizeOperationalAddress(proposal.creatorAddress.value),
        proposal_type: proposal.type,
        title: proposal.title,
        purpose: proposal.purpose,
        description: proposal.description,
        metadata_uri: metadataUri,
        metadata_hash: metadataHash,
        metadata: JSON.stringify(proposal.metadata),
        starts_at: proposal.startsAt,
        ends_at: proposal.endsAt,
        status: toOperationalStatus(proposal.status),
        cancelled_at: proposal.status === ProposalStatus.Cancelled
          ? proposal.updatedAt
          : null,
        finalized_at: proposal.status === ProposalStatus.Closed
          ? proposal.updatedAt
          : null,
        winning_option: null,
        tied: null,
        total_votes: null,
        creation_evidence_id: creationEvidenceId,
        created_at: proposal.createdAt,
        updated_at: proposal.updatedAt,
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
    if (creationEvidenceId) await linkProposalManifest(this.database.executor, proposal.id);
  }

  async markPublished(
    id: string,
    onChainId: string,
    status: ProposalStatus,
    updatedAt: Date,
  ): Promise<void> {
    const normalizedOnChainId = operationalUnsignedDecimal(
      onChainId,
      "onChainId",
    );
    await this.database.executor
      .updateTable("proposals")
      .set({
        on_chain_id: normalizedOnChainId,
        status: toOperationalStatus(status),
        creation_evidence_id: await this.findCreationEvidenceId(
          normalizedOnChainId,
        ),
        updated_at: updatedAt,
      })
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    if (await this.findCreationEvidenceId(normalizedOnChainId)) await linkProposalManifest(this.database.executor, id);
  }

  async updateStatus(
    id: string,
    status: ProposalStatus,
    updatedAt: Date,
  ): Promise<void> {
    const operationalStatus = toOperationalStatus(status);
    await this.database.executor
      .updateTable("proposals")
      .set({
        status: operationalStatus,
        cancelled_at: operationalStatus === "CANCELLED" ? updatedAt : undefined,
        finalized_at: operationalStatus === "FINALIZED" ? updatedAt : undefined,
        updated_at: updatedAt,
      })
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  async markVotingClosed(id: string, updatedAt: Date): Promise<void> {
    await this.database.executor
      .updateTable("proposals")
      .set({ status: "VOTING_CLOSED", updated_at: updatedAt })
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  async recordFinalization(
    id: string,
    winningOption: number,
    tied: boolean,
    totalVotes: string,
    finalizedAt: Date,
  ): Promise<void> {
    if (!Number.isSafeInteger(winningOption) || winningOption < 0) {
      throw new Error("winningOption must be a nonnegative safe integer.");
    }
    await this.database.executor
      .updateTable("proposals")
      .set({
        status: "FINALIZED",
        winning_option: winningOption,
        tied,
        total_votes: operationalUnsignedDecimal(totalVotes, "totalVotes"),
        finalized_at: finalizedAt,
        updated_at: finalizedAt,
      })
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  private async findCreationEvidenceId(
    onChainId: string,
  ): Promise<string | null> {
    const event = await this.database.executor
      .selectFrom("governance_events")
      .select("evidence_id")
      .where("chain_id", "=", this.chainId)
      .where("contract_address", "=", this.contractAddress)
      .where("proposal_id", "=", onChainId)
      .where("event_name", "=", "ProposalCreated")
      .where("canonical", "=", true)
      .executeTakeFirst();
    return event?.evidence_id ?? null;
  }

  private async hydrate(
    row: Selectable<OperationalProposalsTable>,
  ): Promise<Proposal> {
    const options = await this.database.executor
      .selectFrom("proposal_options")
      .select(["option_index", "label"])
      .where("proposal_id", "=", row.id)
      .orderBy("option_index")
      .execute();
    const metadata = row.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error(`Invalid proposal metadata for ${row.id}.`);
    }
    return Proposal.rehydrate({
      id: row.id,
      daoId: row.dao_id,
      creatorAddress: row.creator_address,
      title: row.title,
      purpose: row.purpose,
      description: row.description,
      type: row.proposal_type as ProposalType,
      optionLabels: options.map((option) => option.label),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      metadata: metadata as ProposalMetadata,
      status: fromOperationalStatus(row.status),
      onChainId: row.on_chain_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}

function metadataString(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toOperationalStatus(status: ProposalStatus): string {
  switch (status) {
    case ProposalStatus.Draft:
      return "DRAFT";
    case ProposalStatus.PendingOnChain:
      return "PENDING";
    case ProposalStatus.Active:
      return "ACTIVE";
    case ProposalStatus.Closed:
      return "FINALIZED";
    case ProposalStatus.Cancelled:
      return "CANCELLED";
    case ProposalStatus.Executed:
    case ProposalStatus.Failed:
      throw new Error(`${status} is not a CyberDAOGovernance lifecycle state.`);
  }
}

function fromOperationalStatus(status: string): ProposalStatus {
  switch (status) {
    case "DRAFT":
      return ProposalStatus.Draft;
    case "PENDING":
      return ProposalStatus.PendingOnChain;
    case "ACTIVE":
      return ProposalStatus.Active;
    case "VOTING_CLOSED":
    case "FINALIZED":
      return ProposalStatus.Closed;
    case "CANCELLED":
      return ProposalStatus.Cancelled;
    default:
      throw new Error(`Unsupported operational proposal status: ${status}`);
  }
}
