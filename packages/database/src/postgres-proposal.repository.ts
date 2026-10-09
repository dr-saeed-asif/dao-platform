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
import { sql, type Selectable } from "kysely";
import type { ProposalListQuery, ProposalListResult, ProposalListStatus } from "./proposal-list.types.js";
import type { DaoStatisticsQuery, DaoStatisticsResult } from "./dao-statistics.types.js";
import type { GetContractDeploymentResult } from "./contract-deployment.types.js";
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

  getChainId(): string {
    return this.chainId;
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  async getContractDeployment(): Promise<GetContractDeploymentResult> {
    const asOf = new Date();
    const chainId = this.chainId;
    const contractAddress = this.contractAddress;

    const row = await this.database.executor
      .selectFrom("contract_deployments")
      .selectAll()
      .where("chain_id", "=", chainId)
      .where("contract_address", "=", contractAddress)
      .executeTakeFirst();

    const evidenceId = `deployment:${chainId}:${contractAddress}`;

    if (!row) {
      return {
        found: false,
        chainId,
        contractAddress,
        deploymentTransaction: null,
        deploymentBlockNumber: null,
        deploymentBlockHash: null,
        deploymentTimestamp: null,
        initialOwner: null,
        contractVersion: null,
        abiVersion: null,
        compilerVersion: null,
        bytecodeHash: null,
        metadata: {},
        asOf: asOf.toISOString(),
        evidenceIds: [],
      };
    }

    return {
      found: true,
      chainId,
      contractAddress,
      deploymentTransaction: row.deployment_tx_hash,
      deploymentBlockNumber: row.deployment_block_number,
      deploymentBlockHash: row.deployment_block_hash,
      deploymentTimestamp: row.deployment_timestamp?.toISOString() ?? null,
      initialOwner: row.initial_owner,
      contractVersion: row.contract_version,
      abiVersion: row.abi_version,
      compilerVersion: row.compiler_version,
      bytecodeHash: row.bytecode_hash,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      asOf: asOf.toISOString(),
      evidenceIds: [evidenceId],
    };
  }

  async findById(id: string): Promise<Proposal | null> {
    const row = await this.database.executor
      .selectFrom("proposals")
      .selectAll()
      .where("id", "=", id)
      .where("chain_id", "=", this.chainId)
      .where("contract_address", "=", this.contractAddress)
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
    const rows = await this.database.executor.selectFrom('proposals').selectAll()
      .where('chain_id', '=', this.chainId).where('contract_address', '=', this.contractAddress)
      .where('on_chain_id', 'is', null).where('metadata_hash', '=', normalizeOperationalHash(metadataHash))
      .orderBy('created_at').limit(2).execute();
    const exact = rows.find((row) => row.creator_address === normalizeOperationalAddress(creatorAddress));
    const row = exact ?? (rows.length === 1 ? rows[0] : undefined);
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

  /** Resolve mutable operational evidence within the configured deployment. */
  async findStructuredEvidence(id: string) {
    return this.database.executor.selectFrom("proposals")
      .select(["id", "chain_id", "contract_address", "updated_at", "creation_evidence_id"])
      .where("id", "=", id)
      .where("chain_id", "=", this.chainId)
      .where("contract_address", "=", this.contractAddress)
      .executeTakeFirst();
  }

  async findCreationEvidenceIdForQuery(id: string): Promise<string | null> {
    const row = await this.database.executor
      .selectFrom('proposals')
      .select('creation_evidence_id')
      .where('id', '=', id)
      .where('chain_id', '=', this.chainId)
      .where('contract_address', '=', this.contractAddress)
      .executeTakeFirst();
    return row?.creation_evidence_id ?? null;
  }

  /** A read-only, snapshot-consistent listing for structured query consumers. */
  async listFiltered(
    query: ProposalListQuery,
    asOf: Date,
    daoId?: string,
  ): Promise<ProposalListResult> {
    return this.database.db.transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (transaction) => {
        await sql`SET TRANSACTION READ ONLY`.execute(transaction);
        // Bound database work too: a caller timing out alone does not cancel SQL.
        await sql`SET LOCAL statement_timeout = '4000ms'`.execute(transaction);
        const status = sql<ProposalListStatus>`CASE
          WHEN cancelled_at IS NOT NULL THEN 'CANCELLED'
          WHEN finalized_at IS NOT NULL THEN 'FINALIZED'
          WHEN starts_at > ${asOf} THEN 'UPCOMING'
          WHEN ends_at < ${asOf} THEN 'ENDED'
          ELSE 'ACTIVE'
        END`;
        let filtered = transaction.selectFrom("proposals")
          .where("chain_id", "=", this.chainId)
          .where("contract_address", "=", this.contractAddress);
        if (daoId !== undefined) filtered = filtered.where("dao_id", "=", daoId);
        if (query.from !== null) filtered = filtered.where("starts_at", ">=", new Date(query.from));
        if (query.to !== null) filtered = filtered.where("starts_at", "<=", new Date(query.to));
        if (query.status === "ENDED") {
          filtered = filtered.where((eb) => eb.or([
            eb("ends_at", "<", asOf),
            eb("cancelled_at", "is not", null),
            eb("finalized_at", "is not", null),
          ]));
        } else if (query.status !== null) {
          filtered = filtered.where(status, "=", query.status);
        }
        const total = await filtered.select((eb) => eb.fn.countAll<string>().as("count"))
          .executeTakeFirstOrThrow();
        const rows = await filtered.select([
          "id", "on_chain_id", "title", "creator_address", "starts_at", "ends_at",
        ]).select(status.as("derived_status"))
          .select((eb) => [
            eb.selectFrom("proposal_assignments")
              .select((sub) => sub.fn.countAll<string>().as("count"))
              .whereRef("proposal_assignments.proposal_id", "=", "proposals.id")
              .where("assigned", "=", true).as("member_count"),
            eb.selectFrom("votes")
              .select((sub) => sub.fn.countAll<string>().as("count"))
              .whereRef("votes.proposal_id", "=", "proposals.id").as("vote_count"),
          ])
          .orderBy("created_at", "desc").orderBy("id", "asc")
          .limit(query.limit).offset(query.offset).execute();
        return {
          count: exactCount(total.count),
          proposals: rows.map((row) => ({
            proposalId: row.id,
            onChainProposalId: row.on_chain_id,
            title: row.title,
            creator: row.creator_address,
            status: row.derived_status,
            startsAt: row.starts_at.toISOString(),
            endsAt: row.ends_at.toISOString(),
            memberCount: exactCount(row.member_count),
            voteCount: exactCount(row.vote_count),
          })),
          query: { ...query, asOf: asOf.toISOString(), chainId: this.chainId,
            contractAddress: this.contractAddress, daoId: daoId ?? null },
};
      });
  }

  /** A read-only, snapshot-consistent DAO statistics aggregate. */
  async getDaoStatistics(
    query: DaoStatisticsQuery,
    asOf: Date,
  ): Promise<DaoStatisticsResult> {
    return this.database.db.transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (transaction) => {
        await sql`SET TRANSACTION READ ONLY`.execute(transaction);
        await sql`SET LOCAL statement_timeout = '4000ms'`.execute(transaction);

        let base = transaction.selectFrom("proposals")
          .where("chain_id", "=", this.chainId)
          .where("contract_address", "=", this.contractAddress);
        if (query.daoId !== null) {
          base = base.where("dao_id", "=", query.daoId);
        }

        const proposalCount = await base
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .executeTakeFirstOrThrow();

        const voteCount = await base
          .innerJoin("votes", "votes.proposal_id", "proposals.id")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .executeTakeFirstOrThrow();

        const memberCount = await base
          .innerJoin("proposal_assignments", "proposal_assignments.proposal_id", "proposals.id")
          .where("proposal_assignments.assigned", "=", true)
          .select((eb) => sql<number>`count(distinct ${eb.ref("proposal_assignments.member_address")})`.as("count"))
          .executeTakeFirstOrThrow();

        const artefactCount = await base
          .innerJoin("proposal_artefacts", "proposal_artefacts.proposal_id", "proposals.id")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .executeTakeFirstOrThrow();

        const evidenceId = `structured:dao-statistics:${crypto.randomUUID()}`;

        return {
          proposalCount: exactCount(proposalCount.count),
          voteCount: exactCount(voteCount.count),
          memberCount: exactCount(memberCount.count),
          artefactCount: exactCount(artefactCount.count),
          asOf: asOf.toISOString(),
          chainId: this.chainId,
          contractAddress: this.contractAddress,
          daoId: query.daoId ?? null,
          evidenceIds: [evidenceId],
        };
      });
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

function exactCount(value: string | number | null): number {
  const count = Number(value);
  if (value === null || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Proposal count is outside the supported exact integer range.");
  }
  return count;
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
