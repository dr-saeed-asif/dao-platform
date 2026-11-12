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

function createSubject(persistenceError?: Error, scenario?: {
  latest: bigint;
  range: bigint;
  read: (start: bigint, end: bigint) => Promise<GovernanceChainEvent[]>;
}) {
  const calls: string[] = [];
  const saved: GovernanceChainEvent[] = [];
  const proposalsByChainId = new Map<string, Proposal>();
  const chainEvent = { ...proposalCreated } as Extract<GovernanceChainEvent, { kind: "PROPOSAL_CREATED" }>;
  let draft: Proposal | null = null;
  let checkpoint: bigint | null = null;
  let recordedTransactions = 0;
  const finalizations: unknown[][] = [];

  const proposals: ProposalRepository = {
    async findById() { return null; },
    async findByOnChainId(id) { return proposalsByChainId.get(id) ?? null; },
    async findDraftByMetadataHash() { return draft; },
    async findByIdempotencyKey() { return null; },
    async list() { return []; },
    async insert(proposal) {
      calls.push("project");
      proposalsByChainId.set(proposal.onChainId!, proposal);
    },
    async markPublished(_id, onChainId) {
      calls.push("reconcile");
      if (draft) proposalsByChainId.set(onChainId, draft);
    },
    async updateStatus() {},
    async recordFinalization(...args) { finalizations.push(args); },
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
      async getLastProcessedBlock() { return checkpoint; },
      async setLastProcessedBlock(_name, block) {
        calls.push("checkpoint");
        checkpoint = block;
      },
    },
    {
      async latestBlockNumber() { return scenario?.latest ?? 100n; },
      async findGovernanceEvents(start, end) { return scenario ? scenario.read(start, end) : [chainEvent]; },
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
    scenario?.range ?? 1000n,
  );

  return {
    subject,
    calls,
    saved,
    finalizations,
    checkpoint: () => checkpoint,
    proposal: () => proposalsByChainId.get("7"),
    chainEvent,
    useProjectionAsDraft() {
      draft = proposalsByChainId.get("7") ?? null;
      proposalsByChainId.clear();
    },
    recordedTransactions: () => recordedTransactions,
  };
}

describe("SyncGovernanceUseCase", () => {
  it("persists evidence before retaining the existing SQLite projection", async () => {
    const fixture = createSubject();

    const result = await fixture.subject.execute();

    assert.deepEqual(fixture.calls, ["persist", "project", "checkpoint"]);
    assert.deepEqual(fixture.saved[0], proposalCreated);
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

  it("treats an existing on-chain projection as idempotent during full replay", async () => {
    const fixture = createSubject();
    await fixture.subject.execute();
    Object.assign(fixture.chainEvent, { startsAt: fixture.chainEvent.startsAt + 60 });

    const result = await fixture.subject.execute(true);

    assert.equal(result.mode, "FULL");
    assert.equal(result.indexed.proposals, 0);
    assert.equal(fixture.proposal()?.onChainId, "7");
    assert.equal(fixture.calls.filter((call) => call === "reconcile").length, 1);
    assert.equal(fixture.recordedTransactions(), 2);
  });

  it("links a manifest-matched draft when the backend signer is the chain creator", async () => {
    const fixture = createSubject();
    await fixture.subject.execute();
    fixture.useProjectionAsDraft();
    Object.assign(fixture.chainEvent, { creatorAddress: `0x${"77".repeat(20)}` });

    const result = await fixture.subject.execute(true);

    assert.equal(result.mode, "FULL");
    assert.equal(fixture.proposal()?.id, "onchain-7");
  });
});


const finalized: GovernanceChainEvent = {
  ...proposalCreated, evidenceId: "final", eventName: "ProposalFinalized",
  kind: "PROPOSAL_FINALIZED", onChainProposalId: "7", logIndex: 1,
  winningOption: 0, tied: false, totalVotes: 0,
};

it("orders out-of-order events, deduplicates them, and preserves a zero winner and false tie", async () => {
  const fixture = createSubject(undefined, { latest: 100n, range: 1n,
    read: async () => [finalized, proposalCreated, finalized] });
  const result = await fixture.subject.execute(true);
  assert.equal(result.indexed.finalizations, 1);
  assert.equal(result.coverage, "scan_progress");
  assert.deepEqual(fixture.saved.map(e => e.kind), ["PROPOSAL_CREATED", "PROPOSAL_FINALIZED"]);
  assert.deepEqual(fixture.finalizations, [["onchain-7", 0, false, "0", new Date(1785542400000)]]);
  assert.equal(fixture.checkpoint(), 100n);
});

it("rejects incomplete finalization without advancing the checkpoint or inventing a result", async () => {
  const fixture = createSubject(undefined, { latest: 101n, range: 1n, read: async start =>
    start === 100n ? [proposalCreated] : [{ ...finalized, blockNumber: "101", tied: undefined } as unknown as GovernanceChainEvent] });
  await assert.rejects(fixture.subject.execute(true), /Incomplete or invalid proposal finalization/);
  assert.equal(fixture.checkpoint(), 100n);
  assert.deepEqual(fixture.finalizations, []);
});

it("resumes at the first failed page and reports only scan progress for an empty page", async () => {
  let interrupted = true;
  const requests: bigint[] = [];
  const fixture = createSubject(undefined, { latest: 102n, range: 1n, read: async start => {
    requests.push(start);
    if (start === 101n && interrupted) throw new Error("timeout");
    return start === 100n ? [proposalCreated] : [];
  }});
  await assert.rejects(fixture.subject.execute(true), /timeout/);
  assert.equal(fixture.checkpoint(), 100n);
  interrupted = false;
  const result = await fixture.subject.execute(false);
  assert.deepEqual(requests, [100n, 101n, 101n, 102n]);
  assert.equal(fixture.checkpoint(), 102n);
  assert.equal(result.coverage, "scan_progress");
});

it("rejects an event outside its requested page and does not skip the range", async () => {
  const fixture = createSubject(undefined, { latest: 100n, range: 1n,
    read: async () => [{ ...proposalCreated, blockNumber: "101" }] });
  await assert.rejects(fixture.subject.execute(true), /outside requested range/);
  assert.equal(fixture.checkpoint(), null);
});

it("an omitted event in a successful empty page is classified only as scan progress", async () => {
  const fixture = createSubject(undefined, { latest: 100n, range: 1n, read: async () => [] });
  const result = await fixture.subject.execute(true);
  assert.equal(result.indexed.proposals, 0);
  assert.equal(result.coverage, "scan_progress");
  assert.equal(fixture.checkpoint(), 100n);
});
