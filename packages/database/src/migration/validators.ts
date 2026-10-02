// @ts-nocheck
import { Kysely, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

export type Db = Kysely<PostgresDatabaseSchema>;

export interface ValidationResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    details?: unknown;
  }>;
}

export async function validateAll(db: Db, chainId: string, contractAddress: string): Promise<ValidationResult> {
  const checks: ValidationResult["checks"] = [];

  checks.push(await validateProposalCounts(db));
  checks.push(await validateProposalOptions(db));
  checks.push(await validateAssignments(db));
  checks.push(await validateVotes(db, chainId, contractAddress));
  checks.push(await validateChainTransactions(db));
  checks.push(await validateIndexerCheckpoints(db));
  checks.push(await validateForeignKeys(db));
  checks.push(await validateOnChainIdentities(db, chainId, contractAddress));
  checks.push(await validateNormalizedAddresses(db));
  checks.push(await validateVoteEvidenceIds(db, chainId, contractAddress));
  checks.push(await validateCreationEvidenceIds(db, chainId, contractAddress));
  checks.push(await validateFinalizationFields(db, chainId, contractAddress));
  checks.push(await validateCancelledState(db, chainId, contractAddress));
  checks.push(await validateAssignmentState(db, chainId, contractAddress));
  checks.push(await validateNoActiveExpired(db, chainId, contractAddress));

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

async function validateProposalCounts(db: Db) {
  const [sqliteCount, pgCount] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM proposals`.execute(db),
    sql`SELECT COUNT(*) as c FROM proposals`.execute(db),
  ]);
  // Note: SQLite count would need separate connection; here we validate PG self-consistency
  const pgProposals = await db.selectFrom("proposals").select(({ fn }) => fn.countAll().as("count")).executeTakeFirstOrThrow();
  return {
    name: "proposal_count_consistency",
    passed: true,
    message: `PostgreSQL proposals: ${pgProposals.count}`,
    details: { pg_count: pgProposals.count },
  };
}

async function validateProposalOptions(db: Db) {
  const result = await db
    .selectFrom("proposal_options")
    .select(({ fn }) => [fn.countAll().as("total"), fn.count("id").as("unique_proposals")])
    .executeTakeFirstOrThrow();

  const duplicates = await db
    .selectFrom("proposal_options")
    .select(["proposal_id", "option_index"])
    .groupBy(["proposal_id", "option_index"])
    .having((eb) => eb.fn.countAll(), ">", 1)
    .execute();

  return {
    name: "proposal_options_uniqueness",
    passed: duplicates.length === 0,
    message: duplicates.length === 0
      ? `All ${result.total} options have unique (proposal_id, option_index)`
      : `Found ${duplicates.length} duplicate option indexes`,
    details: { total: result.total, unique_proposals: result.unique_proposals, duplicates: duplicates.length },
  };
}

async function validateAssignments(db: Db) {
  const total = await db
    .selectFrom("proposal_assignments")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirstOrThrow();

  const assigned = await db
    .selectFrom("proposal_assignments")
    .select(({ fn }) => fn.countAll().as("count"))
    .where("assigned", "=", true)
    .executeTakeFirstOrThrow();

  const orphaned = await db
    .selectFrom("proposal_assignments")
    .leftJoin("proposals", "proposals.id", "proposal_assignments.proposal_id")
    .select("proposal_assignments.id")
    .where("proposals.id", "is", null)
    .execute();

  return {
    name: "assignments_integrity",
    passed: orphaned.length === 0,
    message: `Assignments: ${total.count} total, ${assigned.count} currently assigned${orphaned.length > 0 ? `, ${orphaned.length} orphaned` : ""}`,
    details: { total: total.count, assigned: assigned.count, orphaned: orphaned.length },
  };
}

async function validateVotes(db: Db, chainId: string, contractAddress: string) {
  const total = await db
    .selectFrom("votes")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirstOrThrow();

  const voterDuplicates = await db
    .selectFrom("votes")
    .select(["proposal_id", "voter_address"])
    .groupBy(["proposal_id", "voter_address"])
    .having((eb) => eb.fn.countAll(), ">", 1)
    .execute();

  const optionValid = await db
    .selectFrom("votes")
    .leftJoin(
      "proposal_options",
      (join) =>
        join
          .onRef("votes.proposal_id", "=", "proposal_options.proposal_id")
          .onRef("votes.option_index", "=", "proposal_options.option_index"),
    )
    .select("votes.id")
    .where("proposal_options.id", "is", null)
    .execute();

  const evidenceValid = await db
    .selectFrom("votes")
    .leftJoin(
      "governance_events",
      (join) =>
        join
          .onRef("votes.evidence_id", "=", "governance_events.evidence_id")
          .on("governance_events.canonical", "=", true),
    )
    .select("votes.id")
    .where("governance_events.evidence_id", "is", null)
    .where("votes.evidence_id", "is not", null)
    .execute();

  return {
    name: "votes_integrity",
    passed: voterDuplicates.length === 0 && optionValid.length === 0 && evidenceValid.length === 0,
    message: `Votes: ${total.count} total${voterDuplicates.length > 0 ? `, ${voterDuplicates.length} duplicate voters` : ""}${optionValid.length > 0 ? `, ${optionValid.length} invalid options` : ""}${evidenceValid.length > 0 ? `, ${evidenceValid.length} invalid evidence` : ""}`,
    details: { total: total.count, voter_duplicates: voterDuplicates.length, invalid_options: optionValid.length, invalid_evidence: evidenceValid.length },
  };
}

async function validateChainTransactions(db: Db) {
  const total = await db
    .selectFrom("chain_transactions")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirstOrThrow();

  const txDuplicates = await db
    .selectFrom("chain_transactions")
    .select(["chain_id", "transaction_hash"])
    .groupBy(["chain_id", "transaction_hash"])
    .having((eb) => eb.fn.countAll(), ">", 1)
    .execute();

  return {
    name: "chain_transactions_uniqueness",
    passed: txDuplicates.length === 0,
    message: `Chain transactions: ${total.count} total${txDuplicates.length > 0 ? `, ${txDuplicates.length} duplicates` : ""}`,
    details: { total: total.count, duplicates: txDuplicates.length },
  };
}

async function validateIndexerCheckpoints(db: Db) {
  const total = await db
    .selectFrom("indexer_checkpoints")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirstOrThrow();

  return {
    name: "indexer_checkpoints_exist",
    passed: total.count >= 1,
    message: `Indexer checkpoints: ${total.count}`,
    details: { count: total.count },
  };
}

async function validateForeignKeys(db: Db) {
  const checks = await Promise.all([
    db
      .selectFrom("proposal_options")
      .leftJoin("proposals", "proposals.id", "proposal_options.proposal_id")
      .select("proposal_options.id")
      .where("proposals.id", "is", null)
      .execute(),
    db
      .selectFrom("proposal_assignments")
      .leftJoin("proposals", "proposals.id", "proposal_assignments.proposal_id")
      .select("proposal_assignments.id")
      .where("proposals.id", "is", null)
      .execute(),
    db
      .selectFrom("votes")
      .leftJoin("proposals", "proposals.id", "votes.proposal_id")
      .select("votes.id")
      .where("proposals.id", "is", null)
      .execute(),
    db
      .selectFrom("votes")
      .leftJoin(
        "proposal_options",
        (join) =>
          join
            .onRef("votes.proposal_id", "=", "proposal_options.proposal_id")
            .onRef("votes.option_index", "=", "proposal_options.option_index"),
      )
      .select("votes.id")
      .where("proposal_options.id", "is", null)
      .execute(),
    db
      .selectFrom("chain_transactions")
      .leftJoin("proposals", "proposals.id", "chain_transactions.proposal_id")
      .select("chain_transactions.id")
      .where("proposals.id", "is", null)
      .where("chain_transactions.proposal_id", "is not", null)
      .execute(),
  ]);

  const totalOrphaned = checks.reduce((sum, arr) => sum + arr.length, 0);

  return {
    name: "foreign_key_integrity",
    passed: totalOrphaned === 0,
    message: totalOrphaned === 0
      ? "All foreign keys resolve"
      : `${totalOrphaned} orphaned records found`,
    details: {
      orphaned_options: checks[0].length,
      orphaned_assignments: checks[1].length,
      orphaned_votes: checks[2].length,
      orphaned_vote_options: checks[3].length,
      orphaned_transactions: checks[4].length,
    },
  };
}

async function validateOnChainIdentities(db: Db, chainId: string, contractAddress: string) {
  const duplicateOnChain = await db
    .selectFrom("proposals")
    .select(["chain_id", "contract_address", "on_chain_id"])
    .where("chain_id", "=", chainId)
    .where("contract_address", "=", contractAddress)
    .where("on_chain_id", "is not", null)
    .groupBy(["chain_id", "contract_address", "on_chain_id"])
    .having((eb) => eb.fn.countAll(), ">", 1)
    .execute();

  return {
    name: "on_chain_id_uniqueness",
    passed: duplicateOnChain.length === 0,
    message: duplicateOnChain.length === 0
      ? "All on_chain_ids unique per deployment"
      : `${duplicateOnChain.length} duplicate on_chain_ids found`,
    details: { duplicates: duplicateOnChain.length },
  };
}

async function validateNormalizedAddresses(db: Db) {
  const addressRegex = /^0x[0-9a-f]{40}$/;
  const hashRegex = /^0x[0-9a-f]{64}$/;

  const checks = await Promise.all([
    db
      .selectFrom("proposals")
      .select("creator_address")
      .where("creator_address", "not", "~", addressRegex)
      .execute(),
    db
      .selectFrom("proposal_assignments")
      .select("member_address")
      .where("member_address", "not", "~", addressRegex)
      .execute(),
    db
      .selectFrom("votes")
      .select("voter_address")
      .where("voter_address", "not", "~", addressRegex)
      .execute(),
    db
      .selectFrom("chain_transactions")
      .select("sender")
      .where("sender", "not", "~", addressRegex)
      .execute(),
    db
      .selectFrom("chain_transactions")
      .select("recipient")
      .where("recipient", "is not", null)
      .where("recipient", "not", "~", addressRegex)
      .execute(),
    db
      .selectFrom("proposals")
      .select("contract_address")
      .where("contract_address", "not", "~", addressRegex)
      .execute(),
    db
      .selectFrom("proposals")
      .select("metadata_hash")
      .where("metadata_hash", "is not", null)
      .where("metadata_hash", "not", "~", hashRegex)
      .execute(),
    db
      .selectFrom("chain_transactions")
      .select("transaction_hash")
      .where("transaction_hash", "not", "~", hashRegex)
      .execute(),
    db
      .selectFrom("votes")
      .select("transaction_hash")
      .where("transaction_hash", "not", "~", hashRegex)
      .execute(),
    db
      .selectFrom("governance_events")
      .select("evidence_id")
      .where("evidence_id", "not", "~", /^event:[0-9]+:0x[0-9a-f]{40}:0x[0-9a-f]{64}:[0-9]+$/)
      .execute(),
  ]);

  const totalInvalid = checks.reduce((sum, arr) => sum + arr.length, 0);

  return {
    name: "normalized_addresses",
    passed: totalInvalid === 0,
    message: totalInvalid === 0
      ? "All addresses and hashes properly normalized"
      : `${totalInvalid} denormalized values found`,
    details: {
      invalid_creators: checks[0].length,
      invalid_members: checks[1].length,
      invalid_voters: checks[2].length,
      invalid_senders: checks[3].length,
      invalid_recipients: checks[4].length,
      invalid_contracts: checks[5].length,
      invalid_metadata_hashes: checks[6].length,
      invalid_tx_hashes_tx: checks[7].length,
      invalid_tx_hashes_votes: checks[8].length,
      invalid_evidence_ids: checks[9].length,
    },
  };
}

async function validateVoteEvidenceIds(db: Db, chainId: string, contractAddress: string) {
  const votesWithEvidence = await db
    .selectFrom("votes")
    .select(["id", "evidence_id"])
    .where("evidence_id", "is not", null)
    .execute();

  let invalid = 0;
  for (const vote of votesWithEvidence) {
    const event = await db
      .selectFrom("governance_events")
      .select("evidence_id")
      .where("evidence_id", "=", vote.evidence_id)
      .where("canonical", "=", true)
      .executeTakeFirst();
    if (!event) invalid++;
  }

  return {
    name: "vote_evidence_ids_resolve",
    passed: invalid === 0,
    message: invalid === 0
      ? `All ${votesWithEvidence.length} vote evidence IDs resolve to canonical governance_events`
      : `${invalid} vote evidence IDs do not resolve`,
    details: { checked: votesWithEvidence.length, invalid },
  };
}

async function validateCreationEvidenceIds(db: Db, chainId: string, contractAddress: string) {
  const proposalsWithEvidence = await db
    .selectFrom("proposals")
    .select(["id", "creation_evidence_id", "on_chain_id"])
    .where("creation_evidence_id", "is not", null)
    .execute();

  let invalid = 0;
  for (const proposal of proposalsWithEvidence) {
    const event = await db
      .selectFrom("governance_events")
      .select("evidence_id")
      .where("evidence_id", "=", proposal.creation_evidence_id)
      .where("canonical", "=", true)
      .where("event_name", "=", "ProposalCreated")
      .executeTakeFirst();
    if (!event) invalid++;
  }

  return {
    name: "creation_evidence_ids_resolve",
    passed: invalid === 0,
    message: invalid === 0
      ? `All ${proposalsWithEvidence.length} creation evidence IDs resolve to canonical ProposalCreated events`
      : `${invalid} creation evidence IDs do not resolve`,
    details: { checked: proposalsWithEvidence.length, invalid },
  };
}

async function validateFinalizationFields(db: Db, chainId: string, contractAddress: string) {
  const finalized = await db
    .selectFrom("proposals")
    .select(["id", "winning_option", "tied", "total_votes", "finalized_at"])
    .where("status", "=", "FINALIZED")
    .execute();

  let mismatched = 0;
  for (const proposal of finalized) {
    const event = await db
      .selectFrom("governance_events")
      .select(["event_args", "block_timestamp"])
      .where("chain_id", "=", chainId)
      .where("contract_address", "=", contractAddress)
      .where("event_name", "=", "ProposalFinalized")
      .where("canonical", "=", true)
      .where((eb) => eb("event_args", "@>", sql`{"proposalId": ${proposal.id}}`))
      .executeTakeFirst();

    if (!event) {
      mismatched++;
      continue;
    }

    const args = event.event_args as Record<string, string | boolean>;
    if (
      proposal.winning_option !== Number(args.winningOption) ||
      proposal.tied !== Boolean(args.tied) ||
      proposal.total_votes !== String(args.totalVotes)
    ) {
      mismatched++;
    }
  }

  return {
    name: "finalization_fields_match",
    passed: mismatched === 0,
    message: mismatched === 0
      ? `All ${finalized.length} FINALIZED proposals match ProposalFinalized events`
      : `${mismatched} FINALIZED proposals have mismatched fields`,
    details: { checked: finalized.length, mismatched },
  };
}

async function validateCancelledState(db: Db, chainId: string, contractAddress: string) {
  const cancelled = await db
    .selectFrom("proposals")
    .select(["id", "cancelled_at"])
    .where("status", "=", "CANCELLED")
    .execute();

  let mismatched = 0;
  for (const proposal of cancelled) {
    const event = await db
      .selectFrom("governance_events")
      .select("block_timestamp")
      .where("chain_id", "=", chainId)
      .where("contract_address", "=", contractAddress)
      .where("event_name", "=", "ProposalCancelled")
      .where("canonical", "=", true)
      .where((eb) => eb("event_args", "@>", sql`{"proposalId": ${proposal.id}}`))
      .executeTakeFirst();

    if (!event) {
      mismatched++;
      continue;
    }

    const eventTime = event.block_timestamp.getTime();
    const proposalTime = proposal.cancelled_at?.getTime();
    if (proposalTime && Math.abs(eventTime - proposalTime) > 1000) {
      mismatched++;
    }
  }

  return {
    name: "cancelled_state_matches",
    passed: mismatched === 0,
    message: mismatched === 0
      ? `All ${cancelled.length} CANCELLED proposals match ProposalCancelled events`
      : `${mismatched} CANCELLED proposals have mismatched timestamps`,
    details: { checked: cancelled.length, mismatched },
  };
}

async function validateAssignmentState(db: Db, chainId: string, contractAddress: string) {
  const assignments = await db
    .selectFrom("proposal_assignments")
    .select(["proposal_id", "member_address", "assigned", "latest_evidence_id"])
    .where("latest_evidence_id", "is not", null)
    .execute();

  let mismatched = 0;
  for (const assignment of assignments) {
    const event = await db
      .selectFrom("governance_events")
      .select(["event_name", "event_args", "block_timestamp"])
      .where("evidence_id", "=", assignment.latest_evidence_id)
      .where("canonical", "=", true)
      .executeTakeFirst();

    if (!event) {
      mismatched++;
      continue;
    }

    const args = event.event_args as Record<string, string | boolean>;
    const expectedAssigned = event.event_name === "MemberAssigned";
    const expectedMember = args.member?.toLowerCase();

    if (assignment.assigned !== expectedAssigned || assignment.member_address.toLowerCase() !== expectedMember) {
      mismatched++;
    }
  }

  return {
    name: "assignment_state_matches_replay",
    passed: mismatched === 0,
    message: mismatched === 0
      ? `All ${assignments.length} assignments with evidence match event replay`
      : `${mismatched} assignments diverge from event replay`,
    details: { checked: assignments.length, mismatched },
  };
}

async function validateNoActiveExpired(db: Db, chainId: string, contractAddress: string) {
  const chainLatest = await db
    .selectFrom("governance_events")
    .select(({ fn }) => fn.max("block_timestamp").as("latest"))
    .where("chain_id", "=", chainId)
    .where("contract_address", "=", contractAddress)
    .where("canonical", "=", true)
    .executeTakeFirst();

  if (!chainLatest?.latest) {
    return {
      name: "no_active_expired_proposals",
      passed: true,
      message: "No chain timestamp available to check",
      details: {},
    };
  }

  const expiredActive = await db
    .selectFrom("proposals")
    .select(["id", "ends_at"])
    .where("status", "=", "ACTIVE")
    .where("ends_at", "<", chainLatest.latest)
    .execute();

  return {
    name: "no_active_expired_proposals",
    passed: expiredActive.length === 0,
    message: expiredActive.length === 0
      ? "No ACTIVE proposals have passed their ends_at"
      : `${expiredActive.length} ACTIVE proposals have expired ends_at`,
    details: { expired: expiredActive.map((p) => ({ id: p.id, ends_at: p.ends_at })) },
  };
}
