import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProposalType } from "@dao-platform/domain";
import { ChainEventNotFoundError, ChainTransactionRevertedError } from "@dao-platform/application";
import { CyberChainGovernanceGateway, createGovernanceEventEnvelope, eventEvidenceId } from "../src/index.js";
import { SmartContractInterface, Web3RPCClient } from "@cyberchain/smart-contract-wrapper";
import type { BlockData, SmartContractEvent, TransactionReceipt } from "@cyberchain/smart-contract-wrapper";

const gateway = new CyberChainGovernanceGateway({
  rpcURL: "http://localhost:8545",
  chainId: "1212",
  contractAddress: "0x51b43885899bd0301c2beea89addc9d876145d21",
});

const emitter = `0x${"ab".repeat(20)}`;
const txHash = `0x${"cd".repeat(32)}`;
const blockHash = `0x${"ef".repeat(32)}`;
const actor = `0x${"12".repeat(20)}`;
const sender = `0x${"34".repeat(20)}`;
const bytes = (hex: string) => Buffer.from(hex.slice(2), "hex");
const block = { number: 42n, hash: bytes(blockHash), timestamp: 1700000000n } as BlockData;
const receipt = {
  transactionHash: bytes(txHash), blockHash: bytes(blockHash), blockNumber: 42n,
  transactionIndex: 2n, from: bytes(sender), gasUsed: 21000n, status: 1n,
} as TransactionReceipt;

function fixture(name: string, parameters: SmartContractEvent["parameters"], logIndex = 0n): SmartContractEvent {
  return {
    name, signature: name, parameters,
    log: {
      address: emitter, transactionHash: bytes(txHash), blockHash: bytes(blockHash),
      blockNumber: 42n, transactionIndex: 2n, logIndex, removed: false,
      topics: [bytes(`0x${"56".repeat(32)}`)], data: bytes("0x1234"),
    },
  };
}

describe("governance provenance", () => {
  it("normalizes deterministic IDs and distinguishes logs in the same transaction", () => {
    const id = eventEvidenceId("1212", emitter, txHash, 0);
    assert.equal(id, `event:1212:${emitter}:${txHash}:0`);
    assert.equal(id, eventEvidenceId("0x4bc", emitter.toUpperCase(), txHash.toUpperCase(), 0));
    assert.notEqual(id, eventEvidenceId("1212", emitter, txHash, 1));
    assert.throws(() => eventEvidenceId("1212", emitter, txHash, -1));
  });

  it("preserves occurrence time, raw logs, sender, and all named arguments", () => {
    const metadataHash = `0x${"78".repeat(32)}`;
    const cases = [
      [fixture("ProposalCreated", [9n, actor, 1n, bytes(metadataHash), "ipfs://evidence", 3n, 1700000010n, 1700000100n]),
        { proposalId: "9", creator: actor, proposalType: "1", metadataHash, metadataURI: "ipfs://evidence", optionCount: "3", startsAt: "1700000010", endsAt: "1700000100" }],
      [fixture("MemberAssigned", [9n, actor]), { proposalId: "9", member: actor }],
      [fixture("MemberUnassigned", [9n, actor]), { proposalId: "9", member: actor }],
      [fixture("VoteCast", [9n, actor, 2n]), { proposalId: "9", voter: actor, optionIndex: "2" }],
      [fixture("ProposalCancelled", [9n]), { proposalId: "9" }],
      [fixture("ProposalFinalized", [9n, 2n, true, 77n]), { proposalId: "9", winningOption: "2", tied: true, totalVotes: "77" }],
    ] as const;
    for (const [event, args] of cases) {
      const envelope = createGovernanceEventEnvelope(event, receipt, block, "1212", emitter, "2026-09-30T12:00:00.000Z");
      assert.deepEqual(envelope.eventArgs, args);
      assert.equal(envelope.eventName, event.name);
      assert.equal(envelope.blockTimestamp, "1700000000");
      assert.equal(envelope.ingestionTimestamp, "2026-09-30T12:00:00.000Z");
      assert.equal(envelope.transactionSender, sender);
      assert.equal(envelope.transactionIndex, 2);
      assert.equal(envelope.rawData, "0x1234");
      assert.deepEqual(envelope.rawTopics, [`0x${"56".repeat(32)}`]);
      const replay = createGovernanceEventEnvelope(event, receipt, block, "1212", emitter, "2026-10-01T12:00:00.000Z");
      assert.equal(replay.evidenceId, envelope.evidenceId);
      assert.equal(replay.blockTimestamp, envelope.blockTimestamp);
    }
  });

  it("rejects mismatched emitters and block metadata", () => {
    const event = fixture("VoteCast", [9n, actor, 0n]);
    assert.throws(() => createGovernanceEventEnvelope(event, receipt, block, "1212", actor, "now"), /emitter/);
    assert.throws(() => createGovernanceEventEnvelope(event, receipt, { ...block, hash: bytes(txHash) }, "1212", emitter, "now"), /mismatch/);
    assert.throws(() => createGovernanceEventEnvelope({ ...event, log: { ...event.log, removed: true } }, receipt, block, "1212", emitter, "now"), /mismatch/);
  });

  it("enriches every gateway event using eth_chainId and its containing block", async (t) => {
    const events = [
      fixture("ProposalCreated", [9n, actor, 1n, bytes(blockHash), "ipfs://evidence", 3n, 1700000010n, 1700000100n], 0n),
      fixture("MemberAssigned", [9n, actor], 1n),
      fixture("MemberUnassigned", [9n, actor], 2n),
      fixture("VoteCast", [9n, actor, 2n], 3n),
      fixture("ProposalCancelled", [9n], 4n),
      fixture("ProposalFinalized", [9n, 2n, true, 77n], 5n),
    ];
    const rpc = Web3RPCClient.getInstance();
    t.mock.method(SmartContractInterface.prototype, "findEvents", async () => [...events].reverse());
    const identity = t.mock.method(rpc, "rpcRequest", async (method: string) => {
      assert.equal(method, "eth_chainId");
      return "0x4bc";
    });
    const receipts = t.mock.method(rpc, "getTransactionReceipt", async () => receipt);
    const blocks = t.mock.method(rpc, "getBlockByNumber", async (number: bigint) => {
      assert.equal(number, 42n);
      return block;
    });
    const subject = new CyberChainGovernanceGateway({ rpcURL: "http://fixture.invalid", chainId: "1212", contractAddress: emitter });
    const result = await subject.findGovernanceEvents(42n, 42n);
    assert.equal(result.length, 6);
    assert.equal(new Set(result.map((event) => event.evidenceId)).size, 6);
    assert.deepEqual(result.map((event) => event.logIndex), [0, 1, 2, 3, 4, 5]);
    assert.equal(result[0]?.kind, "PROPOSAL_CREATED");
    assert.equal(result[5]?.kind, "PROPOSAL_FINALIZED");
    if (result[5]?.kind === "PROPOSAL_FINALIZED") {
      assert.equal(result[5].winningOption, 2);
      assert.equal(result[5].tied, true);
      assert.equal(result[5].totalVotes, 77);
      assert.equal(result[5].eventArgs.proposalId, "9");
    }
    for (const event of result) {
      assert.equal(event.transactionSender, sender);
      assert.equal(event.blockTimestamp, "1700000000");
      assert.ok(Number.isFinite(Date.parse(event.ingestionTimestamp)));
      if (event.kind === "VOTE_CAST") assert.equal(event.voterAddress, actor);
      if (event.kind === "MEMBER_ASSIGNED") assert.equal(event.memberAddress, actor);
      if (event.kind === "PROPOSAL_CREATED") assert.equal(event.creatorAddress, actor);
    }
    assert.equal(identity.mock.callCount(), 1);
    assert.equal(receipts.mock.callCount(), 1);
    assert.equal(blocks.mock.callCount(), 1);
    await assert.rejects(new CyberChainGovernanceGateway({ rpcURL: "http://fixture.invalid", chainId: "1", contractAddress: emitter }).findGovernanceEvents(42n, 42n), /chain ID/);
  });
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

  it("rejects a reverted createProposal receipt before reading events", async (t) => {
    const subject = new CyberChainGovernanceGateway({ rpcURL: "http://fixture.invalid", chainId: "1212", contractAddress: emitter });
    (subject as unknown as { transactionOptions(): object }).transactionOptions = () => ({});
    t.mock.method(SmartContractInterface.prototype, "callMutableMethod", async () => ({ receipt: { ...receipt, status: 0n } }));

    await assert.rejects(
      subject.publishProposal(request),
      (error: unknown) => error instanceof ChainTransactionRevertedError,
    );
  });

  it("rejects a confirmed createProposal receipt without ProposalCreated", async (t) => {
    const subject = new CyberChainGovernanceGateway({ rpcURL: "http://fixture.invalid", chainId: "1212", contractAddress: emitter });
    (subject as unknown as { transactionOptions(): object }).transactionOptions = () => ({});
    t.mock.method(SmartContractInterface.prototype, "callMutableMethod", async () => ({ receipt }));
    t.mock.method(SmartContractInterface.prototype, "findEvent", () => null);

    await assert.rejects(
      subject.publishProposal(request),
      (error: unknown) => error instanceof ChainEventNotFoundError,
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
