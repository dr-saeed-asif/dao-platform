import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Proposal, ProposalType } from "@dao-platform/domain";
import {
  ApplicationError,
  CreateProposalCommand,
  CreateProposalUseCase,
  PreparedTransaction,
  ProposalRepository,
} from "../src/index.js";

const command: CreateProposalCommand = {
  idempotencyKey: "request-123",
  actorAddress: "0xAABBCCDD",
  daoId: "dao-1",
  title: "Fund security audit",
  purpose: "Improve protocol safety",
  description: "Fund an independent audit of the governance contracts.",
  type: ProposalType.Treasury,
  optionLabels: ["Approve", "Reject", "Abstain"],
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-08T00:00:00.000Z"),
};

const preparedTransaction: PreparedTransaction = {
  chainId: "1337",
  from: "0xaabbccdd",
  to: "0x1234",
  data: "0xabcdef",
  value: "0",
};

class InMemoryProposalRepository implements ProposalRepository {
  private readonly byId = new Map<string, Proposal>();
  private readonly byIdempotencyKey = new Map<string, Proposal>();

  async findById(id: string): Promise<Proposal | null> {
    return this.byId.get(id) ?? null;
  }

  async findByOnChainId(onChainId: string): Promise<Proposal | null> {
    return (
      [...this.byId.values()].find(
        (proposal) => proposal.onChainId === onChainId,
      ) ?? null
    );
  }

  async findByIdempotencyKey(key: string): Promise<Proposal | null> {
    return this.byIdempotencyKey.get(key) ?? null;
  }

  async list(limit: number, offset: number): Promise<readonly Proposal[]> {
    return [...this.byId.values()].slice(offset, offset + limit);
  }

  async insert(
    proposal: Proposal,
    options: { readonly idempotencyKey: string },
  ): Promise<void> {
    this.byId.set(proposal.id, proposal);
    this.byIdempotencyKey.set(options.idempotencyKey, proposal);
  }

  async markPublished(): Promise<void> {
    throw new Error("Not used in this test.");
  }
}

function createSubject(options?: { readonly authorized?: boolean }) {
  const proposals = new InMemoryProposalRepository();
  let generatedIds = 0;
  let transactionRuns = 0;
  let preparationRuns = 0;

  const subject = new CreateProposalUseCase({
    proposals,
    authorization: {
      async assertCanCreateProposal(): Promise<void> {
        if (options?.authorized === false) {
          throw new ApplicationError("FORBIDDEN", "Not allowed.");
        }
      },
    },
    chainGateway: {
      async prepareCreateProposal(): Promise<PreparedTransaction> {
        preparationRuns += 1;
        return preparedTransaction;
      },
      async publishProposal() {
        throw new Error("Not used in this test.");
      },
      async assignMembers() {
        throw new Error("Not used in this test.");
      },
      async unassignMember() {
        throw new Error("Not used in this test.");
      },
      async prepareVote() {
        throw new Error("Not used in this test.");
      },
      async getConfirmedVote() {
        throw new Error("Not used in this test.");
      },
      async findConfirmedVotes() {
        throw new Error("Not used in this test.");
      },
      async latestBlockNumber() {
        throw new Error("Not used in this test.");
      },
    },
    transactionManager: {
      async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
        transactionRuns += 1;
        return work();
      },
    },
    idGenerator: {
      next(): string {
        generatedIds += 1;
        return `proposal-${generatedIds}`;
      },
    },
    clock: {
      now: () => new Date("2026-07-14T00:00:00.000Z"),
    },
  });

  return {
    subject,
    counters: {
      generatedIds: () => generatedIds,
      transactionRuns: () => transactionRuns,
      preparationRuns: () => preparationRuns,
    },
  };
}

describe("CreateProposalUseCase", () => {
  it("persists a draft and returns a wallet-signable transaction", async () => {
    const { subject, counters } = createSubject();

    const result = await subject.execute(command);

    assert.equal(result.proposal.id, "proposal-1");
    assert.equal(result.proposal.creatorAddress, "0xaabbccdd");
    assert.deepEqual(result.transaction, preparedTransaction);
    assert.equal(counters.transactionRuns(), 1);
    assert.equal(counters.preparationRuns(), 1);
  });

  it("reuses the proposal when the same request is retried", async () => {
    const { subject, counters } = createSubject();

    const first = await subject.execute(command);
    const retry = await subject.execute(command);

    assert.equal(retry.proposal.id, first.proposal.id);
    assert.equal(counters.generatedIds(), 1);
    assert.equal(counters.preparationRuns(), 2);
  });

  it("rejects reuse of an idempotency key for different input", async () => {
    const { subject } = createSubject();
    await subject.execute(command);

    await assert.rejects(
      subject.execute({ ...command, title: "A different proposal" }),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "IDEMPOTENCY_KEY_CONFLICT",
    );
  });

  it("rejects an idempotent retry with different metadata", async () => {
    const { subject } = createSubject();
    await subject.execute({ ...command, metadata: { document: "ipfs://one" } });

    await assert.rejects(
      subject.execute({
        ...command,
        metadata: { document: "ipfs://two" },
      }),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "IDEMPOTENCY_KEY_CONFLICT",
    );
  });

  it("does not persist or prepare a transaction when unauthorized", async () => {
    const { subject, counters } = createSubject({ authorized: false });

    await assert.rejects(
      subject.execute(command),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === "FORBIDDEN",
    );
    assert.equal(counters.transactionRuns(), 0);
    assert.equal(counters.preparationRuns(), 0);
  });
});
