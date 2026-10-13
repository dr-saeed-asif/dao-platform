import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { resolve } from "node:path";
import {
  BrowserProvider,
  ContractFactory,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import ganache from "ganache";

const artifact = JSON.parse(
  readFileSync(resolve("artifacts/CyberDAOGovernance.json"), "utf8"),
);

describe("CyberDAOGovernance", () => {
  let chain;
  let provider;
  let owner;
  let member;
  let outsider;
  let contract;
  let start;
  let end;

  before(async () => {
    chain = ganache.provider({
      chain: { hardfork: "london" },
      logging: { quiet: true },
      wallet: { totalAccounts: 4 },
    });
    provider = new BrowserProvider(chain);
    owner = await provider.getSigner(0);
    member = await provider.getSigner(1);
    outsider = await provider.getSigner(2);

    const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
    contract = await factory.deploy(await owner.getAddress());
    await contract.waitForDeployment();

    const latestBlock = await provider.getBlock("latest");
    start = Number(latestBlock.timestamp) + 60;
    end = start + 3600;
    await (
      await contract.createProposal(
        "ipfs://proposal-metadata",
        keccak256(toUtf8Bytes("proposal-metadata")),
        1,
        3,
        start,
        end,
      )
    ).wait();
  });

  after(async () => {
    await chain.disconnect();
  });

  it("creates proposals only through the owner", async () => {
    assert.equal(await contract.proposalCount(), 1n);
    const proposal = await contract.getProposal(1);
    assert.equal(proposal.optionCount, 3n);

    await assert.rejects(
      contract
        .connect(outsider)
        .createProposal(
          "ipfs://unauthorized",
          keccak256(toUtf8Bytes("unauthorized")),
          0,
          2,
          start + 1,
          end + 1,
        ),
    );
  });

  it("assigns proposal-specific members before voting starts", async () => {
    const memberAddress = await member.getAddress();
    await (await contract.assignMembers(1, [memberAddress])).wait();
    assert.equal(await contract.isAssigned(1, memberAddress), true);
  });

  it("enforces assignment and prevents duplicate voting", async () => {
    await provider.send("evm_increaseTime", [61]);
    await provider.send("evm_mine", []);

    await assert.rejects(contract.connect(outsider).vote(1, 0));
    await (await contract.connect(member).vote(1, 0)).wait();
    assert.equal(await contract.hasVoted(1, await member.getAddress()), true);
    assert.equal(await contract.optionVoteCount(1, 0), 1n);
    await assert.rejects(contract.connect(member).vote(1, 1));
  });

  it("finalizes the winning option after voting ends", async () => {
    await provider.send("evm_increaseTime", [3601]);
    await provider.send("evm_mine", []);

    await (await contract.connect(outsider).finalizeProposal(1)).wait();
    const proposal = await contract.getProposal(1);
    assert.equal(proposal.finalized, true);
    assert.equal(proposal.winningOption, 0n);
    assert.equal(proposal.tied, false);
  });
});
