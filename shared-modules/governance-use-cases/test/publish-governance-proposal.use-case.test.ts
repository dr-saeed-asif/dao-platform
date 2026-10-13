import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Proposal, ProposalStatus, ProposalType } from "@dao-platform/domain";
import {
  ApplicationError,
  ChainEventNotFoundError,
  ChainTransactionRevertedError,
  GovernanceChainGateway,
  ProposalRepository,
  PublishProposalUseCase,
} from "../src/index.js";

const proposal = Proposal.rehydrate({
  id: "proposal-1",
  daoId: "dao-1",
  creatorAddress: `0x${"11".repeat(20)}`,
  title: "Fund security audit",
  purpose: "Improve protocol safety",
  description: "Fund an independent contract security audit.",
  type: ProposalType.Standard,
  optionLabels: ["Approve", "Reject"],
  startsAt: new Date("2026-10-07T18:03:00.000Z"),
  endsAt: new Date("2026-10-07T19:10:00.000Z"),
  metadata: {
    metadataURI: "ipfs://proposal",
    metadataHash: `0x${"22".repeat(32)}`,
  },
  status: ProposalStatus.Draft,
  onChainId: null,
  createdAt: new Date("2026-10-07T18:01:00.000Z"),
  updatedAt: new Date("2026-10-07T18:01:00.000Z"),
});

function createSubject(
  now: Date,
  publishProposal: GovernanceChainGateway["publishProposal"],
) {
  let publishCalls = 0;
  const proposals: ProposalRepository = {
    async findById() { return proposal; },
    async findByOnChainId() { return null; },
    async findByIdempotencyKey() { return null; },
    async list() { return []; },
    async insert() {},
    async markPublished() {},
    async updateStatus() {},
  };
  const chain = {
    async publishProposal(request: Parameters<GovernanceChainGateway["publishProposal"]>[0]) {
      publishCalls += 1;
      return publishProposal(request);
    },
  } as GovernanceChainGateway;
  return {
    subject: new PublishProposalUseCase(
      proposals,
      { async record() {}, async listForProposal() { return []; } },
      { async assertCanCreateProposal() {} },
      chain,
      { async runInTransaction<T>(work: () => Promise<T>) { return work(); } },
      { now: () => now },
    ),
    publishCalls: () => publishCalls,
  };
}

describe("PublishProposalUseCase", () => {
  it("rejects an expired draft before submitting a transaction", async () => {
    const fixture = createSubject(
      new Date("2026-10-07T18:06:00.000Z"),
      async () => { throw new Error("must not be called"); },
    );

    await assert.rejects(
      fixture.subject.execute(proposal.id, proposal.creatorAddress.value),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INVALID_VOTING_PERIOD" &&
        error.message.includes("2026-10-07T18:03:00.000Z") &&
        error.message.includes("2026-10-07T18:06:00.000Z"),
    );
    assert.equal(fixture.publishCalls(), 0);
  });

  it("returns a structured application error for a reverted receipt", async () => {
    const fixture = createSubject(
      new Date("2026-10-07T18:02:00.000Z"),
      async () => { throw new ChainTransactionRevertedError(); },
    );

    await assert.rejects(
      fixture.subject.execute(proposal.id, proposal.creatorAddress.value),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === "TRANSACTION_REVERTED",
    );
  });

  it("returns a structured application error when ProposalCreated is absent", async () => {
    const fixture = createSubject(
      new Date("2026-10-07T18:02:00.000Z"),
      async () => { throw new ChainEventNotFoundError("ProposalCreated"); },
    );

    await assert.rejects(
      fixture.subject.execute(proposal.id, proposal.creatorAddress.value),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === "CHAIN_EVENT_MISSING",
    );
  });
});
