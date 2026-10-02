// @ts-nocheck
import { Kysely, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";
import type { GovernanceEventEnvelope } from "@dao-platform/application";

export type Db = Kysely<PostgresDatabaseSchema>;

export interface ReconcileContext {
  chainId: string;
  contractAddress: string;
}

export interface ProposalReconcileResult {
  status: "DRAFT" | "PENDING" | "ACTIVE" | "VOTING_CLOSED" | "CANCELLED" | "FINALIZED";
  cancelledAt: Date | null;
  finalizedAt: Date | null;
  winningOption: number | null;
  tied: boolean | null;
  totalVotes: string | null;
  creationEvidenceId: string | null;
  creatorAddress: string | null;
  proposalType: string | null;
  metadataUri: string | null;
  metadataHash: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  blockTimestamp: Date | null;
  conflicts: Array<{
    field: string;
    sqliteValue: string;
    blockchainValue: string;
    resolution: string;
  }>;
}

export interface AssignmentReconcileResult {
  assigned: boolean;
  latestEvidenceId: string | null;
  effectiveFrom: Date | null;
  transactionHash: string | null;
  conflicts: Array<{
    field: string;
    sqliteValue: string;
    blockchainValue: string;
    resolution: string;
  }>;
}

export interface VoteReconcileResult {
  voterAddress: string;
  optionIndex: number;
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: Date;
  gasUsed: string | null;
  evidenceId: string | null;
  conflicts: Array<{
    field: string;
    sqliteValue: string;
    blockchainValue: string;
    resolution: string;
  }>;
}

export interface ChainTransactionReconcileResult {
  sender: string | null;
  recipient: string | null;
  blockNumber: string | null;
  blockHash: string | null;
  transactionIndex: number | null;
  conflicts: Array<{
    field: string;
    sqliteValue: string;
    blockchainValue: string;
    resolution: string;
  }>;
}

export async function findProposalCreatedEvent(
  db: Db,
  ctx: ReconcileContext,
  onChainId: string,
): Promise<{
  evidenceId: string;
  eventArgs: Record<string, string | boolean>;
  blockTimestamp: Date;
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
} | null> {
  const row = await db
    .selectFrom("governance_events")
    .select(["evidence_id", "event_args", "block_timestamp", "transaction_hash", "block_number", "block_hash"])
    .where("chain_id", "=", ctx.chainId)
    .where("contract_address", "=", ctx.contractAddress)
    .where("event_name", "=", "ProposalCreated")
    .where("canonical", "=", true)
    .where((eb) =>
      eb("event_args", "@>", sql`{"proposalId": ${onChainId}}`),
    )
    .orderBy("block_number", "desc")
    .executeTakeFirst();

  if (!row) return null;

  return {
    evidenceId: row.evidence_id,
    eventArgs: row.event_args as Record<string, string | boolean>,
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    blockHash: row.block_hash,
  };
}

export async function findProposalCancelledEvent(
  db: Db,
  ctx: ReconcileContext,
  onChainId: string,
): Promise<{
  evidenceId: string;
  blockTimestamp: Date;
} | null> {
  const row = await db
    .selectFrom("governance_events")
    .select(["evidence_id", "block_timestamp"])
    .where("chain_id", "=", ctx.chainId)
    .where("contract_address", "=", ctx.contractAddress)
    .where("event_name", "=", "ProposalCancelled")
    .where("canonical", "=", true)
    .where((eb) =>
      eb("event_args", "@>", sql`{"proposalId": ${onChainId}}`),
    )
    .orderBy("block_number", "desc")
    .executeTakeFirst();

  if (!row) return null;

  return {
    evidenceId: row.evidence_id,
    blockTimestamp: row.block_timestamp,
  };
}

export async function findProposalFinalizedEvent(
  db: Db,
  ctx: ReconcileContext,
  onChainId: string,
): Promise<{
  evidenceId: string;
  eventArgs: Record<string, string | boolean>;
  blockTimestamp: Date;
} | null> {
  const row = await db
    .selectFrom("governance_events")
    .select(["evidence_id", "event_args", "block_timestamp"])
    .where("chain_id", "=", ctx.chainId)
    .where("contract_address", "=", ctx.contractAddress)
    .where("event_name", "=", "ProposalFinalized")
    .where("canonical", "=", true)
    .where((eb) =>
      eb("event_args", "@>", sql`{"proposalId": ${onChainId}}`),
    )
    .orderBy("block_number", "desc")
    .executeTakeFirst();

  if (!row) return null;

  return {
    evidenceId: row.evidence_id,
    eventArgs: row.event_args as Record<string, string | boolean>,
    blockTimestamp: row.block_timestamp,
  };
}

export async function findMemberEvents(
  db: Db,
  ctx: ReconcileContext,
  onChainId: string,
): Promise<Array<{
  evidenceId: string;
  eventName: "MemberAssigned" | "MemberUnassigned";
  memberAddress: string;
  blockTimestamp: Date;
  transactionHash: string;
  blockNumber: string;
  transactionIndex: number;
  logIndex: number;
}>> {
  const rows = await db
    .selectFrom("governance_events")
    .select([
      "evidence_id",
      "event_name",
      "event_args",
      "block_timestamp",
      "transaction_hash",
      "block_number",
      "transaction_index",
      "log_index",
    ])
    .where("chain_id", "=", ctx.chainId)
    .where("contract_address", "=", ctx.contractAddress)
    .where("event_name", "in", ["MemberAssigned", "MemberUnassigned"])
    .where("canonical", "=", true)
    .where((eb) =>
      eb("event_args", "@>", sql`{"proposalId": ${onChainId}}`),
    )
    .orderBy(["block_number", "transaction_index", "log_index"])
    .execute();

  return rows.map((row) => ({
    evidenceId: row.evidence_id,
    eventName: row.event_name as "MemberAssigned" | "MemberUnassigned",
    memberAddress: (row.event_args as Record<string, string | boolean>).member as string,
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    transactionIndex: Number(row.transaction_index),
    logIndex: Number(row.log_index),
  }));
}

export async function findVoteCastEvent(
  db: Db,
  ctx: ReconcileContext,
  onChainProposalId: string,
  voterAddress: string,
  transactionHash: string,
): Promise<{
  evidenceId: string;
  eventArgs: Record<string, string | boolean>;
  blockTimestamp: Date;
  blockNumber: string;
  blockHash: string;
  gasUsed: string | null;
} | null> {
  const row = await db
    .selectFrom("governance_events")
    .select([
      "evidence_id",
      "event_args",
      "block_timestamp",
      "block_number",
      "block_hash",
      "event_args",
    ])
    .where("chain_id", "=", ctx.chainId)
    .where("contract_address", "=", ctx.contractAddress)
    .where("event_name", "=", "VoteCast")
    .where("canonical", "=", true)
    .where("transaction_hash", "=", transactionHash)
    .where((eb) =>
      eb("event_args", "@>", sql`{"proposalId": ${onChainProposalId}}`),
    )
    .where((eb) =>
      eb("event_args", "@>", sql`{"voter": ${voterAddress.toLowerCase()}}`),
    )
    .executeTakeFirst();

  if (!row) return null;

  const eventArgs = row.event_args as Record<string, string | boolean>;
  const gasUsed = eventArgs.gasUsed ? String(eventArgs.gasUsed) : null;

  return {
    evidenceId: row.evidence_id,
    eventArgs,
    blockTimestamp: row.block_timestamp,
    blockNumber: row.block_number,
    blockHash: row.block_hash,
    gasUsed,
  };
}

export async function findGovernanceEventsByTxHash(
  db: Db,
  ctx: ReconcileContext,
  transactionHash: string,
): Promise<Array<{
  evidenceId: string;
  eventName: string;
  transactionSender: string;
  transactionIndex: number;
  blockNumber: string;
  blockHash: string;
}>> {
  const rows = await db
    .selectFrom("governance_events")
    .select([
      "evidence_id",
      "event_name",
      "transaction_sender",
      "transaction_index",
      "block_number",
      "block_hash",
    ])
    .where("chain_id", "=", ctx.chainId)
    .where("contract_address", "=", ctx.contractAddress)
    .where("transaction_hash", "=", transactionHash)
    .where("canonical", "=", true)
    .orderBy("log_index")
    .execute();

  return rows.map((row) => ({
    evidenceId: row.evidence_id,
    eventName: row.event_name,
    transactionSender: row.transaction_sender,
    transactionIndex: Number(row.transaction_index),
    blockNumber: row.block_number,
    blockHash: row.block_hash,
  }));
}

export function deriveProposalStatus(
  proposal: {
    onChainId: string | null;
    startsAt: Date;
    endsAt: Date;
    sqliteStatus: string;
  },
  cancelledEvent: { blockTimestamp: Date } | null,
  finalizedEvent: { blockTimestamp: Date } | null,
  chainLatestTimestamp: Date,
): "DRAFT" | "PENDING" | "ACTIVE" | "VOTING_CLOSED" | "CANCELLED" | "FINALIZED" {
  if (!proposal.onChainId) return "DRAFT";
  if (cancelledEvent) return "CANCELLED";
  if (finalizedEvent) return "FINALIZED";
  if (chainLatestTimestamp >= proposal.endsAt) return "VOTING_CLOSED";
  if (chainLatestTimestamp >= proposal.startsAt) return "ACTIVE";
  return "PENDING";
}

export function reconcileProposal(
  sqliteProposal: {
    id: string;
    daoId: string;
    idempotencyKey: string;
    onChainId: string | null;
    creatorAddress: string;
    proposalType: string;
    title: string;
    purpose: string;
    description: string;
    metadata: Record<string, unknown>;
    startsAt: Date;
    endsAt: Date;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  createdEvent: Awaited<ReturnType<typeof findProposalCreatedEvent>>,
  cancelledEvent: Awaited<ReturnType<typeof findProposalCancelledEvent>>,
  finalizedEvent: Awaited<ReturnType<typeof findProposalFinalizedEvent>>,
  chainLatestTimestamp: Date,
): ProposalReconcileResult {
  const conflicts: ProposalReconcileResult["conflicts"] = [];
  const metadata = sqliteProposal.metadata as Record<string, unknown>;

  let creatorAddress = sqliteProposal.creatorAddress;
  let proposalType = sqliteProposal.proposalType;
  let metadataUri: string | null = null;
  let metadataHash: string | null = null;
  let startsAt = sqliteProposal.startsAt;
  let endsAt = sqliteProposal.endsAt;
  let blockTimestamp: Date | null = null;

  if (createdEvent) {
    blockTimestamp = createdEvent.blockTimestamp;
    const args = createdEvent.eventArgs;

    if (args.creator && args.creator.toLowerCase() !== sqliteProposal.creatorAddress.toLowerCase()) {
      conflicts.push({
        field: "creator_address",
        sqliteValue: sqliteProposal.creatorAddress,
        blockchainValue: args.creator,
        resolution: "blockchain",
      });
      creatorAddress = args.creator;
    }

    if (args.proposalType) {
      const onChainType = mapProposalType(String(args.proposalType));
      if (onChainType !== sqliteProposal.proposalType) {
        conflicts.push({
          field: "proposal_type",
          sqliteValue: sqliteProposal.proposalType,
          blockchainValue: onChainType,
          resolution: "blockchain",
        });
        proposalType = onChainType;
      }
    }

    if (args.metadataURI) {
      const sqliteUri = (metadata.metadataURI as string) || "";
      if (args.metadataURI !== sqliteUri) {
        conflicts.push({
          field: "metadata_uri",
          sqliteValue: sqliteUri,
          blockchainValue: args.metadataURI,
          resolution: "blockchain",
        });
      }
      metadataUri = args.metadataURI;
    }

    if (args.metadataHash) {
      const sqliteHash = (metadata.metadataHash as string) || "";
      if (args.metadataHash !== sqliteHash) {
        conflicts.push({
          field: "metadata_hash",
          sqliteValue: sqliteHash,
          blockchainValue: args.metadataHash,
          resolution: "blockchain",
        });
      }
      metadataHash = args.metadataHash;
    }

    if (args.startsAt) {
      const onChainStarts = new Date(Number(args.startsAt) * 1000);
      if (onChainStarts.getTime() !== sqliteProposal.startsAt.getTime()) {
        conflicts.push({
          field: "starts_at",
          sqliteValue: sqliteProposal.startsAt.toISOString(),
          blockchainValue: onChainStarts.toISOString(),
          resolution: "blockchain",
        });
      }
      startsAt = onChainStarts;
    }

    if (args.endsAt) {
      const onChainEnds = new Date(Number(args.endsAt) * 1000);
      if (onChainEnds.getTime() !== sqliteProposal.endsAt.getTime()) {
        conflicts.push({
          field: "ends_at",
          sqliteValue: sqliteProposal.endsAt.toISOString(),
          blockchainValue: onChainEnds.toISOString(),
          resolution: "blockchain",
        });
      }
      endsAt = onChainEnds;
    }
  }

  const status = deriveProposalStatus(
    { onChainId: sqliteProposal.onChainId, startsAt, endsAt, sqliteStatus: sqliteProposal.status },
    cancelledEvent,
    finalizedEvent,
    chainLatestTimestamp,
  );

  let cancelledAt: Date | null = null;
  let finalizedAt: Date | null = null;
  let winningOption: number | null = null;
  let tied: boolean | null = null;
  let totalVotes: string | null = null;

  if (cancelledEvent) {
    cancelledAt = cancelledEvent.blockTimestamp;
  }

  if (finalizedEvent) {
    finalizedAt = finalizedEvent.blockTimestamp;
    const args = finalizedEvent.eventArgs;
    if (args.winningOption) winningOption = Number(args.winningOption);
    if (args.tied !== undefined) tied = Boolean(args.tied);
    if (args.totalVotes) totalVotes = String(args.totalVotes);
  }

  return {
    status,
    cancelledAt,
    finalizedAt,
    winningOption,
    tied,
    totalVotes,
    creationEvidenceId: createdEvent?.evidenceId ?? null,
    creatorAddress,
    proposalType,
    metadataUri,
    metadataHash,
    startsAt,
    endsAt,
    blockTimestamp,
    conflicts,
  };
}

function mapProposalType(code: string): string {
  const map: Record<string, string> = {
    "0": "STANDARD",
    "1": "TREASURY",
    "2": "PARAMETER_CHANGE",
    "3": "MEMBERSHIP",
    "255": "OTHER",
  };
  return map[code] ?? "OTHER";
}

export function replayAssignments(
  events: Awaited<ReturnType<typeof findMemberEvents>>,
  sqliteAssignments: Map<string, { transactionHash: string; assignedAt: Date }>,
): Map<string, AssignmentReconcileResult> {
  const result = new Map<string, AssignmentReconcileResult>();

  for (const event of events) {
    const member = event.memberAddress.toLowerCase();
    const assigned = event.eventName === "MemberAssigned";
    const existing = result.get(member);

    result.set(member, {
      assigned,
      latestEvidenceId: event.evidenceId,
      effectiveFrom: event.blockTimestamp,
      transactionHash: event.transactionHash,
      conflicts: [],
    });
  }

  for (const [member, sqliteData] of sqliteAssignments) {
    if (!result.has(member)) {
      result.set(member, {
        assigned: true,
        latestEvidenceId: null,
        effectiveFrom: sqliteData.assignedAt,
        transactionHash: sqliteData.transactionHash,
        conflicts: [{
          field: "assignment",
          sqliteValue: "assigned",
          blockchainValue: "no_event",
          resolution: "sqlite_preserved",
        }],
      });
    }
  }

  return result;
}

export function reconcileVote(
  sqliteVote: {
    proposalId: string;
    onChainProposalId: string;
    voterAddress: string;
    optionIndex: number;
    transactionHash: string;
    blockNumber: string;
    blockHash: string;
    gasUsed: string;
    confirmedAt: Date;
  },
  voteEvent: Awaited<ReturnType<typeof findVoteCastEvent>>,
): VoteReconcileResult {
  const conflicts: VoteReconcileResult["conflicts"] = [];

  if (!voteEvent) {
    return {
      voterAddress: sqliteVote.voterAddress,
      optionIndex: sqliteVote.optionIndex,
      transactionHash: sqliteVote.transactionHash,
      blockNumber: sqliteVote.blockNumber,
      blockHash: sqliteVote.blockHash,
      blockTimestamp: sqliteVote.confirmedAt,
      gasUsed: sqliteVote.gasUsed,
      evidenceId: null,
      conflicts: [{
        field: "vote",
        sqliteValue: "exists",
        blockchainValue: "no_event",
        resolution: "sqlite_preserved_unverified",
      }],
    };
  }

  const args = voteEvent.eventArgs;

  let voterAddress = sqliteVote.voterAddress;
  let optionIndex = sqliteVote.optionIndex;
  let transactionHash = sqliteVote.transactionHash;
  let blockNumber = sqliteVote.blockNumber;
  let blockHash = sqliteVote.blockHash;
  let blockTimestamp = sqliteVote.confirmedAt;
  let gasUsed: string | null = sqliteVote.gasUsed;

  if (args.voter && args.voter.toLowerCase() !== sqliteVote.voterAddress.toLowerCase()) {
    conflicts.push({
      field: "voter_address",
      sqliteValue: sqliteVote.voterAddress,
      blockchainValue: args.voter,
      resolution: "blockchain",
    });
    voterAddress = args.voter;
  }

  if (args.optionIndex !== undefined) {
    const onChainOption = Number(args.optionIndex);
    if (onChainOption !== sqliteVote.optionIndex) {
      conflicts.push({
        field: "option_index",
        sqliteValue: String(sqliteVote.optionIndex),
        blockchainValue: String(onChainOption),
        resolution: "blockchain",
      });
      optionIndex = onChainOption;
    }
  }

  if (voteEvent.blockNumber !== sqliteVote.blockNumber) {
    conflicts.push({
      field: "block_number",
      sqliteValue: sqliteVote.blockNumber,
      blockchainValue: voteEvent.blockNumber,
      resolution: "blockchain",
    });
    blockNumber = voteEvent.blockNumber;
  }

  if (voteEvent.blockHash !== sqliteVote.blockHash) {
    conflicts.push({
      field: "block_hash",
      sqliteValue: sqliteVote.blockHash,
      blockchainValue: voteEvent.blockHash,
      resolution: "blockchain",
    });
    blockHash = voteEvent.blockHash;
  }

  if (voteEvent.blockTimestamp.getTime() !== sqliteVote.confirmedAt.getTime()) {
    conflicts.push({
      field: "block_timestamp",
      sqliteValue: sqliteVote.confirmedAt.toISOString(),
      blockchainValue: voteEvent.blockTimestamp.toISOString(),
      resolution: "blockchain",
    });
    blockTimestamp = voteEvent.blockTimestamp;
  }

  if (voteEvent.gasUsed && voteEvent.gasUsed !== sqliteVote.gasUsed) {
    conflicts.push({
      field: "gas_used",
      sqliteValue: sqliteVote.gasUsed,
      blockchainValue: voteEvent.gasUsed,
      resolution: "blockchain",
    });
    gasUsed = voteEvent.gasUsed;
  }

  return {
    voterAddress,
    optionIndex,
    transactionHash,
    blockNumber,
    blockHash,
    blockTimestamp,
    gasUsed,
    evidenceId: voteEvent.evidenceId,
    conflicts,
  };
}

export function reconcileChainTransaction(
  sqliteTx: {
    transactionHash: string;
    proposalId: string | null;
    walletAddress: string;
    blockNumber: string | null;
    blockHash: string | null;
    gasUsed: string | null;
    operation: string;
  },
  governanceEvents: Awaited<ReturnType<typeof findGovernanceEventsByTxHash>>,
): ChainTransactionReconcileResult {
  const conflicts: ChainTransactionReconcileResult["conflicts"] = [];

  let sender: string | null = null;
  let recipient: string | null = null;
  let blockNumber: string | null = sqliteTx.blockNumber;
  let blockHash: string | null = sqliteTx.blockHash;
  let transactionIndex: number | null = null;

  if (governanceEvents.length > 0) {
    const firstEvent = governanceEvents[0];
    sender = firstEvent.transactionSender;
    recipient = firstEvent.eventName === "ProposalCreated" ? null : firstEvent.contractAddress ?? null;

    if (firstEvent.blockNumber !== sqliteTx.blockNumber) {
      conflicts.push({
        field: "block_number",
        sqliteValue: sqliteTx.blockNumber ?? "null",
        blockchainValue: firstEvent.blockNumber,
        resolution: "blockchain",
      });
      blockNumber = firstEvent.blockNumber;
    }

    if (firstEvent.blockHash !== sqliteTx.blockHash) {
      conflicts.push({
        field: "block_hash",
        sqliteValue: sqliteTx.blockHash ?? "null",
        blockchainValue: firstEvent.blockHash,
        resolution: "blockchain",
      });
      blockHash = firstEvent.blockHash;
    }

    transactionIndex = firstEvent.transactionIndex;
  }

  return { sender, recipient, blockNumber, blockHash, transactionIndex, conflicts };
}
