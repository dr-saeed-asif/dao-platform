import assert from "node:assert/strict";
import test from "node:test";
import type {
  GovernanceEventEnvelope,
  RecordChainTransactionInput,
} from "@dao-platform/application";
import { Proposal, ProposalStatus, ProposalType } from "@dao-platform/domain";
import {
  createPostgresDatabase,
  migratePostgresToLatest,
  PostgresAssignmentRepository,
  PostgresChainTransactionRepository,
  PostgresGovernanceEventRepository,
  PostgresOperationalDatabase,
  PostgresProposalRepository,
  PostgresSyncStateRepository,
  PostgresVoteRepository,
} from "../src/index.js";

const chainId = "1212";
const contractAddress = "0x51b43885899bd0301c2beea89addc9d876145d21";
const creator = `0x${"ab".repeat(20)}`;
const member = `0x${"cd".repeat(20)}`;
const blockHash = `0x${"ef".repeat(32)}`;

test("PostgreSQL operational repositories preserve DAO projections", {
  skip: !process.env.POSTGRES_URL,
}, async () => {
  const database = createPostgresDatabase(process.env.POSTGRES_URL!);
  const operational = new PostgresOperationalDatabase(database);
  const proposals = new PostgresProposalRepository(
    operational,
    chainId,
    contractAddress,
  );
  const assignments = new PostgresAssignmentRepository(operational);
  const votes = new PostgresVoteRepository(operational);
  const transactions = new PostgresChainTransactionRepository(
    operational,
    chainId,
    contractAddress,
  );
  const checkpoints = new PostgresSyncStateRepository(
    operational,
    chainId,
    contractAddress,
    "test-v1",
  );
  const events = new PostgresGovernanceEventRepository(database);
  const suffix = `${process.pid}${Date.now()}`;
  const proposalId = `pg-operational-${suffix}`;
  const onChainProposalId = Date.now().toString();
  const creationHash = hash("11", suffix);
  const sharedHash = hash("22", suffix);
  const unassignmentHash = hash("33", suffix);
  const evidenceIds: string[] = [];

  const saveEvent = async (
    transactionHash: string,
    logIndex: number,
    eventName: GovernanceEventEnvelope["eventName"],
    eventArgs: Readonly<Record<string, string | boolean>>,
  ) => {
    const event: GovernanceEventEnvelope = {
      evidenceId: `event:${chainId}:${contractAddress}:${transactionHash}:${logIndex}`,
      chainId,
      contractAddress,
      eventName,
      transactionHash,
      transactionIndex: 3,
      logIndex,
      blockNumber: "16000000",
      blockHash,
      blockTimestamp: "1785542400",
      transactionSender: creator,
      eventArgs,
      rawTopics: [`0x${"44".repeat(32)}`],
      rawData: "0x",
      ingestionTimestamp: "2026-09-30T12:34:56.000Z",
    };
    await events.saveGovernanceEvent(event);
    evidenceIds.push(event.evidenceId);
    return event;
  };

  try {
    await migratePostgresToLatest(database);
    await saveEvent(creationHash, 0, "ProposalCreated", {
      proposalId: onChainProposalId,
      creator,
      proposalType: "0",
      metadataHash: `0x${"55".repeat(32)}`,
      metadataURI: "ipfs://proposal",
      optionCount: "2",
      startsAt: "1785542400",
      endsAt: "1786147200",
    });

    const createdAt = new Date("2026-09-30T12:00:00.000Z");
    const proposal = Proposal.rehydrate({
      id: proposalId,
      daoId: "cyber-dao",
      creatorAddress: creator,
      title: "Operational PostgreSQL proposal",
      purpose: "Exercise the operational repository",
      description: "Verify the PostgreSQL operational DAO projection repositories.",
      type: ProposalType.Standard,
      optionLabels: ["Approve", "Reject"],
      startsAt: new Date("2026-10-01T00:00:00.000Z"),
      endsAt: new Date("2026-10-08T00:00:00.000Z"),
      metadata: {
        metadataURI: "ipfs://proposal",
        metadataHash: `0x${"55".repeat(32)}`,
      },
      status: ProposalStatus.Active,
      onChainId: onChainProposalId,
      createdAt,
      updatedAt: createdAt,
    });
    await operational.runInTransaction(async () => {
      await operational.runInTransaction(() =>
        proposals.insert(proposal, { idempotencyKey: `idem-${suffix}` }),
      );
    });

    const storedProposal = await proposals.findById(proposalId);
    assert.equal(storedProposal?.title, proposal.title);
    assert.deepEqual(
      storedProposal?.options.map((option) => option.label),
      ["Approve", "Reject"],
    );
    const proposalRow = await database
      .selectFrom("proposals")
      .select(["creation_evidence_id", "metadata_uri", "metadata_hash"])
      .where("id", "=", proposalId)
      .executeTakeFirstOrThrow();
    assert.equal(proposalRow.creation_evidence_id, evidenceIds[0]);
    assert.equal(proposalRow.metadata_uri, "ipfs://proposal");

    const duplicateProposal = Proposal.rehydrate({
      id: `${proposalId}-duplicate`,
      daoId: proposal.daoId,
      creatorAddress: proposal.creatorAddress.value,
      title: proposal.title,
      purpose: proposal.purpose,
      description: proposal.description,
      type: proposal.type,
      optionLabels: proposal.options.map((option) => option.label),
      startsAt: proposal.startsAt,
      endsAt: proposal.endsAt,
      metadata: proposal.metadata,
      status: proposal.status,
      onChainId: proposal.onChainId,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    });
    await assert.rejects(
      proposals.insert(duplicateProposal, {
        idempotencyKey: `idem-${suffix}-duplicate`,
      }),
      /duplicate key value violates unique constraint/,
    );
    await assert.rejects(
      database.insertInto("proposal_options").values({
        proposal_id: proposalId,
        option_index: 0,
        label: "Duplicate",
      }).execute(),
      /proposal_options_proposal_index_uq/,
    );

    const assignmentTime = new Date("2026-09-30T12:10:00.000Z");
    await assignments.addMany([{
      proposalId,
      walletAddress: `0x${"CD".repeat(20)}`,
      transactionHash: sharedHash,
      assignedAt: assignmentTime,
    }]);
    await assignments.addMany([{
      proposalId,
      walletAddress: member,
      transactionHash: sharedHash,
      assignedAt: new Date("2026-09-30T12:11:00.000Z"),
    }]);
    const currentAssignments = await assignments.list(proposalId);
    assert.equal(currentAssignments.length, 1);
    assert.equal(currentAssignments[0]?.walletAddress, member);

    const voteEvent = await saveEvent(sharedHash, 1, "VoteCast", {
      proposalId: onChainProposalId,
      voter: member,
      optionIndex: "0",
    });
    const assignmentEvent = await saveEvent(sharedHash, 2, "MemberAssigned", {
      proposalId: onChainProposalId,
      member,
    });
    await assignments.applyMembershipEvidence(
      proposalId,
      member,
      true,
      assignmentEvent.evidenceId,
    );
    let assignmentRow = await database
      .selectFrom("proposal_assignments")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .executeTakeFirstOrThrow();
    assert.equal(assignmentRow.assigned, true);
    assert.equal(assignmentRow.latest_evidence_id, assignmentEvent.evidenceId);

    const unassignmentEvent = await saveEvent(
      unassignmentHash,
      0,
      "MemberUnassigned",
      { proposalId: onChainProposalId, member },
    );
    await assignments.applyMembershipEvidence(
      proposalId,
      member,
      false,
      unassignmentEvent.evidenceId,
    );
    assert.equal((await assignments.list(proposalId)).length, 0);
    assignmentRow = await database
      .selectFrom("proposal_assignments")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .executeTakeFirstOrThrow();
    assert.equal(assignmentRow.assigned, false);
    assert.equal(assignmentRow.latest_evidence_id, unassignmentEvent.evidenceId);

    const vote = {
      proposalId,
      onChainProposalId,
      voterAddress: member,
      optionIndex: 0,
      transactionHash: sharedHash,
      blockNumber: "16000000",
      blockHash,
      gasUsed: "75000",
      confirmedAt: new Date("2026-09-30T12:35:00.000Z"),
    };
    await votes.upsert(vote);
    await votes.upsert(vote);
    assert.equal((await votes.list(proposalId)).length, 1);
    const voteRow = await database
      .selectFrom("votes")
      .select(["evidence_id", "block_timestamp", "voting_weight"])
      .where("proposal_id", "=", proposalId)
      .executeTakeFirstOrThrow();
    assert.equal(voteRow.evidence_id, voteEvent.evidenceId);
    assert.equal(voteRow.block_timestamp.toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(voteRow.voting_weight, 1);
    await assert.rejects(votes.upsert({ ...vote, optionIndex: 1 }), /VoteCast evidence/);

    const transaction: RecordChainTransactionInput = {
      transactionHash: sharedHash,
      blockNumber: "16000000",
      blockHash,
      gasUsed: "75000",
      status: "CONFIRMED",
      operation: "CAST_VOTE",
      proposalId,
      walletAddress: member,
      recordedAt: new Date("2026-09-30T12:36:00.000Z"),
    };
    await transactions.record(transaction);
    await transactions.record({ ...transaction, operation: "ASSIGN_MEMBERS" });
    const eventCount = await database
      .selectFrom("governance_events")
      .select(({ fn }) => fn.countAll<string>().as("count"))
      .where("transaction_hash", "=", sharedHash)
      .executeTakeFirstOrThrow();
    const transactionCount = await database
      .selectFrom("chain_transactions")
      .select(({ fn }) => fn.countAll<string>().as("count"))
      .where("chain_id", "=", chainId)
      .where("transaction_hash", "=", sharedHash)
      .executeTakeFirstOrThrow();
    assert.equal(eventCount.count, "2");
    assert.equal(transactionCount.count, "1");

    await proposals.markVotingClosed(
      proposalId,
      new Date("2026-10-08T00:00:00.000Z"),
    );
    assert.equal(
      (await database.selectFrom("proposals").select("status")
        .where("id", "=", proposalId).executeTakeFirstOrThrow()).status,
      "VOTING_CLOSED",
    );
    await proposals.recordFinalization(
      proposalId,
      0,
      false,
      "4294967295",
      new Date("2026-10-08T00:01:00.000Z"),
    );
    const finalized = await database
      .selectFrom("proposals")
      .select(["status", "winning_option", "tied", "total_votes"])
      .where("id", "=", proposalId)
      .executeTakeFirstOrThrow();
    assert.deepEqual(finalized, {
      status: "FINALIZED",
      winning_option: 0,
      tied: false,
      total_votes: "4294967295",
    });

    await checkpoints.setCheckpoint("governance-full", 16000000n, blockHash);
    assert.equal(await checkpoints.getLastProcessedBlock("governance-full"), 16000000n);

    await operational.clearGovernanceData();
    assert.equal(
      (await database.selectFrom("proposals").select(({ fn }) =>
        fn.countAll<string>().as("count")).executeTakeFirstOrThrow()).count,
      "0",
    );
    assert.equal(
      (await database.selectFrom("governance_events").select(({ fn }) =>
        fn.countAll<string>().as("count")).where("evidence_id", "in", evidenceIds)
        .executeTakeFirstOrThrow()).count,
      evidenceIds.length.toString(),
    );
  } finally {
    await operational.clearGovernanceData();
    if (evidenceIds.length > 0) {
      await database
        .deleteFrom("governance_events")
        .where("evidence_id", "in", evidenceIds)
        .execute();
    }
    await operational.destroy();
  }
});

function hash(prefix: string, suffix: string): string {
  return `0x${`${prefix}${BigInt(suffix).toString(16)}`.padStart(64, "0").slice(-64)}`;
}
