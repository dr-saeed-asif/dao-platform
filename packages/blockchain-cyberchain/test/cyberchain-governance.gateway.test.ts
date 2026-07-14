import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProposalType } from "@dao-platform/domain";
import { CyberChainGovernanceGateway } from "../src/index.js";

const gateway = new CyberChainGovernanceGateway({
  rpcURL: "http://localhost:8545",
  chainId: "1212",
  contractAddress: "0x51b43885899bd0301c2beea89addc9d876145d21",
});

const request = {
  localProposalId: "proposal-1",
  daoId: "dao-1",
  creatorAddress: "0xb8163f7d6d404f67a400743b90f7952d2d137b8e",
  title: "Fund security audit",
  purpose: "Improve protocol safety",
  description: "Fund an independent contract security audit.",
  type: ProposalType.Treasury,
  optionLabels: ["Approve", "Reject", "Abstain"],
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-08T00:00:00.000Z"),
  metadata: {
    metadataURI: "ipfs://proposal",
    metadataHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
} as const;

describe("CyberChainGovernanceGateway", () => {
  it("encodes a wallet-signable createProposal transaction", async () => {
    const transaction = await gateway.prepareCreateProposal(request);

    assert.equal(transaction.chainId, "1212");
    assert.equal(transaction.to, "0x51b43885899bd0301c2beea89addc9d876145d21");
    assert.equal(transaction.value, "0");
    assert.match(transaction.data, /^0x[0-9a-f]+$/);
    assert.ok(transaction.data.length > 10);
  });

  it("requires content-addressed proposal metadata", async () => {
    await assert.rejects(
      gateway.prepareCreateProposal({ ...request, metadata: {} }),
      /metadataURI/,
    );
  });

  it("encodes a member wallet-signable vote transaction", async () => {
    const transaction = await gateway.prepareVote(
      "1",
      "0xb8163f7d6d404f67a400743b90f7952d2d137b8e",
      2,
    );
    assert.equal(
      transaction.from,
      "0xb8163f7d6d404f67a400743b90f7952d2d137b8e",
    );
    assert.equal(transaction.to, "0x51b43885899bd0301c2beea89addc9d876145d21");
    assert.equal(transaction.value, "0");
    assert.match(transaction.data, /^0x[0-9a-f]+$/);
  });
});
