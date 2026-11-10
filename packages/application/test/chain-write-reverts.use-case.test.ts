import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Proposal, ProposalStatus, ProposalType } from "@dao-platform/domain";
import {
  ApplicationError,
  AssignMembersUseCase,
  CancelProposalUseCase,
  ChainTransactionRevertedError,
  FinalizeProposalUseCase,
  GovernanceChainGateway,
  ProposalRepository,
  UnassignMemberUseCase,
} from "../src/index.js";

// Review finding C1: when the chain write fails (reverted receipt or any other error),
// no off-chain state may be written. These tests run every use case against a gateway
// that throws, and count the repository writes.

const member = `0x${"34".repeat(20)}`;
const actor = `0x${"11".repeat(20)}`;

const proposal = Proposal.rehydrate({
  id: "proposal-1",
  daoId: "dao-1",
  creatorAddress: actor,
  title: "Fund security audit",
  purpose: "Improve protocol safety",
  description: "Fund an independent contract security audit.",
  type: ProposalType.Standard,
  optionLabels: ["Approve", "Reject"],
  startsAt: new Date("2020-01-01T00:00:00.000Z"),
  endsAt: new Date("2020-01-08T00:00:00.000Z"),
  metadata: { metadataURI: "ipfs://proposal", metadataHash: `0x${"22".repeat(32)}` },
  status: ProposalStatus.Active,
  onChainId: "9",
  createdAt: new Date("2019-12-31T00:00:00.000Z"),
  updatedAt: new Date("2019-12-31T00:00:00.000Z"),
});

const confirmed = {
  transactionHash: `0x${"cd".repeat(32)}`,
  blockNumber: "42",
  blockHash: `0x${"ef".repeat(32)}`,
  gasUsed: "21000",
  status: "CONFIRMED",
} as const;

function harness(chainBehaviour: () => Promise<unknown>) {
  const writes = { addMany: 0, remove: 0, record: 0, updateStatus: 0 };
  const proposals: ProposalRepository = {
    async findById() { return proposal; },
    async findByOnChainId() { return null; },
    async findByIdempotencyKey() { return null; },
    async list() { return []; },
    async insert() {},
    async markPublished() {},
    async updateStatus() { writes.updateStatus += 1; },
  };
  const assignments = {
    async addMany() { writes.addMany += 1; },
    async remove() { writes.remove += 1; },
    async list() { return []; },
  };
  const transactions = {
    async record() { writes.record += 1; },
    async listForProposal() { return []; },
  };
  const chain = {
    assignMembers: chainBehaviour,
    unassignMember: chainBehaviour,
    cancelProposal: chainBehaviour,
    finalizeProposal: chainBehaviour,
  } as unknown as GovernanceChainGateway;
  const authorization = { async assertCanCreateProposal() {} };
  const transactionManager = { async runInTransaction<T>(work: () => Promise<T>) { return work(); } };
  const clock = { now: () => new Date("2026-11-10T12:00:00.000Z") };
  return {
    writes,
    assign: new AssignMembersUseCase(proposals, assignments, transactions, authorization, chain, transactionManager, clock),
    unassign: new UnassignMemberUseCase(proposals, assignments, transactions, authorization, chain, transactionManager, clock),
    cancel: new CancelProposalUseCase(proposals, transactions, authorization, chain, transactionManager),
    finalize: new FinalizeProposalUseCase(proposals, transactions, authorization, chain, transactionManager),
  };
}

const reverted = async () => { throw new ChainTransactionRevertedError(); };

describe("chain write failures leave no off-chain state (C1)", () => {
  it("assign: a reverted transaction records no assignment and no transaction", async () => {
    const h = harness(reverted);
    await assert.rejects(
      h.assign.execute(proposal.id, actor, [member]),
      (error: unknown) => error instanceof ApplicationError && error.code === "TRANSACTION_REVERTED",
    );
    assert.deepEqual(h.writes, { addMany: 0, remove: 0, record: 0, updateStatus: 0 });
  });

  it("unassign: a reverted transaction removes no assignment and records no transaction", async () => {
    const h = harness(reverted);
    await assert.rejects(
      h.unassign.execute(proposal.id, actor, member),
      (error: unknown) => error instanceof ApplicationError && error.code === "TRANSACTION_REVERTED",
    );
    assert.deepEqual(h.writes, { addMany: 0, remove: 0, record: 0, updateStatus: 0 });
  });

  it("cancel: a reverted transaction does not mark the proposal cancelled", async () => {
    const h = harness(reverted);
    await assert.rejects(
      h.cancel.execute(proposal.id, actor),
      (error: unknown) => error instanceof ApplicationError && error.code === "TRANSACTION_REVERTED",
    );
    assert.deepEqual(h.writes, { addMany: 0, remove: 0, record: 0, updateStatus: 0 });
  });

  it("finalize: a reverted transaction does not close the proposal", async () => {
    const h = harness(reverted);
    await assert.rejects(
      h.finalize.execute(proposal.id, actor),
      (error: unknown) => error instanceof ApplicationError && error.code === "FINALIZATION_FAILED",
    );
    assert.deepEqual(h.writes, { addMany: 0, remove: 0, record: 0, updateStatus: 0 });
  });

  it("assign, unassign and cancel do not relabel unrelated chain errors as reverts", async () => {
    const h = harness(async () => { throw new Error("rpc unavailable"); });
    for (const run of [
      () => h.assign.execute(proposal.id, actor, [member]),
      () => h.unassign.execute(proposal.id, actor, member),
      () => h.cancel.execute(proposal.id, actor),
    ]) {
      await assert.rejects(run(), (error: unknown) => error instanceof Error && error.message === "rpc unavailable");
    }
    assert.deepEqual(h.writes, { addMany: 0, remove: 0, record: 0, updateStatus: 0 });
  });

  it("control: a confirmed transaction still records state exactly once", async () => {
    const h = harness(async () => ({ ...confirmed, winningOption: 1, tied: false, totalVotes: 2 }));
    await h.assign.execute(proposal.id, actor, [member]);
    await h.unassign.execute(proposal.id, actor, member);
    await h.cancel.execute(proposal.id, actor);
    await h.finalize.execute(proposal.id, actor);
    assert.deepEqual(h.writes, { addMany: 1, remove: 1, record: 4, updateStatus: 2 });
  });
});
