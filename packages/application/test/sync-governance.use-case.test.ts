import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Proposal } from "@dao-platform/domain";
import {
  GovernanceChainEvent,
  GovernanceEventRepository,
  ProposalRepository,
  StoredGovernanceEvent,
  SyncGovernanceUseCase,
} from "../src/index.js";

const proposalCreated: GovernanceChainEvent = {
  evidenceId: `event:1212:0x${"11".repeat(20)}:0x${"22".repeat(32)}:0`,
  chainId: "1212",
  contractAddress: `0x${"11".repeat(20)}`,
  eventName: "ProposalCreated",
  transactionHash: `0x${"22".repeat(32)}`,
  transactionIndex: 2,
  logIndex: 0,
  blockNumber: "100",
  blockHash: `0x${"33".repeat(32)}`,
  blockTimestamp: "1785542400",
  transactionSender: `0x${"44".repeat(20)}`,
  eventArgs: {
    proposalId: "7",
    creator: `0x${"44".repeat(20)}`,
    proposalType: "0",
    metadataHash: `0x${"55".repeat(32)}`,
    metadataURI: "",
    optionCount: "2",
    startsAt: "1785542400",
    endsAt: "1786147200",
  },
  rawTopics: [`0x${"66".repeat(32)}`],
  rawData: "0x",
  ingestionTimestamp: "2026-09-30T00:00:00.000Z",
  gasUsed: "100000",
  status: "CONFIRMED",
  kind: "PROPOSAL_CREATED",
  onChainProposalId: "7",
  creatorAddress: `0x${"44".repeat(20)}`,
  proposalType: 0,
  metadataHash: `0x${"55".repeat(32)}`,
  metadataURI: "",
  optionCount: 2,
  startsAt: 1785542400,
  endsAt: 1786147200,
};

function createSubject(persistenceError?: Error) {
  const calls: string[] = [];
  const saved: GovernanceChainEvent[] = [];
  const proposalsByChainId = new Map<string, Proposal>();
  let checkpoint: bigint | null = null;
  let recordedTransactions = 0;

  const proposals: ProposalRepository = {
    async findById() { return null; },
    async findByOnChainId(id) { return proposalsByChainId.get(id) ?? null; },
    async findByIdempotencyKey() { return null; },
    async list() { return []; },
    async insert(proposal) {
      calls.push("project");
      proposalsByChainId.set(proposal.onChainId!, proposal);
    },
    async markPublished() {},
    async updateStatus() {},
  };
  const governanceEvents: GovernanceEventRepository = {
    async saveGovernanceEvent(event) {
      calls.push("persist");
      if (persistenceError) throw persistenceError;
      saved.push(event as GovernanceChainEvent);
    },
    async findGovernanceEventByEvidenceId(): Promise<StoredGovernanceEvent | null> {
      return null;
    },
    async listGovernanceEvents(): Promise<readonly StoredGovernanceEvent[]> {
      return [];
    },
    async eventExists() { return false; },
  };
  const subject = new SyncGovernanceUseCase(
    proposals,
    { async addMany() {}, async remove() {}, async list() { return []; } },
    {
      async findByProposalAndVoter() { return null; },
      async upsert() {},
      async list() { return []; },
    },
    {
      async record() { recordedTransactions += 1; },
      async listForProposal() { return []; },
    },
    {
      async getLastProcessedBlock() { return null; },
      async setLastProcessedBlock(_name, block) {
        calls.push("checkpoint");
        checkpoint = block;
      },
    },
    {
      async latestBlockNumber() { return 100n; },
      async findGovernanceEvents() { return [proposalCreated]; },
      async prepareCreateProposal() { throw new Error("Not used."); },
      async publishProposal() { throw new Error("Not used."); },
      async assignMembers() { throw new Error("Not used."); },
      async unassignMember() { throw new Error("Not used."); },
      async prepareVote() { throw new Error("Not used."); },
      async getConfirmedVote() { throw new Error("Not used."); },
      async findConfirmedVotes() { throw new Error("Not used."); },
      async cancelProposal() { throw new Error("Not used."); },
      async finalizeProposal() { throw new Error("Not used."); },
    },
    governanceEvents,
    { async runInTransaction<T>(work: () => Promise<T>) { return work(); } },
    100n,
    1000n,
  );

  return {
    subject,
    calls,
    saved,
    checkpoint: () => checkpoint,
    proposal: () => proposalsByChainId.get("7"),
    recordedTransactions: () => recordedTransactions,
  };
}

describe("SyncGovernanceUseCase", () => {
  it("persists evidence before retaining the existing SQLite projection", async () => {
    const fixture = createSubject();

    const result = await fixture.subject.execute();

    assert.deepEqual(fixture.calls, ["persist", "project", "checkpoint"]);
    assert.equal(fixture.saved[0], proposalCreated);
    assert.equal(fixture.proposal()?.onChainId, "7");
    assert.equal(fixture.recordedTransactions(), 1);
    assert.equal(fixture.checkpoint(), 100n);
    assert.equal(result.indexed.proposals, 1);
  });

  it("surfaces persistence failure without projection or checkpoint", async () => {
    const failure = new Error("PostgreSQL unavailable");
    const fixture = createSubject(failure);

    await assert.rejects(fixture.subject.execute(), failure);

    assert.deepEqual(fixture.calls, ["persist"]);
    assert.equal(fixture.proposal(), undefined);
    assert.equal(fixture.recordedTransactions(), 0);
    assert.equal(fixture.checkpoint(), null);
  });
});
