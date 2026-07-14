import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DomainRuleError,
  Proposal,
  ProposalStatus,
  ProposalType,
} from "../src/index.js";

const validInput = {
  id: "proposal-1",
  daoId: "dao-1",
  creatorAddress: "0xAABBCCDD",
  title: "Fund security audit",
  purpose: "Improve protocol safety",
  description: "Fund an independent audit of the governance contracts.",
  type: ProposalType.Treasury,
  optionLabels: ["Approve", "Reject", "Abstain"],
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-08T00:00:00.000Z"),
  now: new Date("2026-07-14T00:00:00.000Z"),
} as const;

describe("Proposal", () => {
  it("creates a normalized draft proposal", () => {
    const proposal = Proposal.create(validInput);

    assert.equal(proposal.status, ProposalStatus.Draft);
    assert.equal(proposal.onChainId, null);
    assert.equal(proposal.creatorAddress.value, "0xaabbccdd");
    assert.deepEqual(
      proposal.options.map((option) => option.index),
      [0, 1, 2],
    );
  });

  it("rejects a voting period that does not move forward", () => {
    assert.throws(
      () =>
        Proposal.create({
          ...validInput,
          endsAt: validInput.startsAt,
        }),
      (error: unknown) =>
        error instanceof DomainRuleError &&
        error.code === "INVALID_VOTING_PERIOD",
    );
  });

  it("rejects duplicate option labels regardless of case", () => {
    assert.throws(
      () =>
        Proposal.create({
          ...validInput,
          optionLabels: ["Approve", "approve"],
        }),
      (error: unknown) =>
        error instanceof DomainRuleError &&
        error.code === "DUPLICATE_VOTING_OPTION",
    );
  });

  it("requires an on-chain id for a synchronized proposal", () => {
    assert.throws(
      () =>
        Proposal.rehydrate({
          ...validInput,
          status: ProposalStatus.Active,
          onChainId: null,
          createdAt: validInput.now,
          updatedAt: validInput.now,
        }),
      (error: unknown) =>
        error instanceof DomainRuleError &&
        error.code === "MISSING_ON_CHAIN_ID",
    );
  });
});
