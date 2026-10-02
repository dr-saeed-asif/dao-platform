import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceEventEnvelope } from "@dao-platform/application";
import {
  createPostgresDatabase,
  migratePostgresToLatest,
  PostgresGovernanceEventRepository,
} from "../src/index.js";

test("PostgreSQL governance event repository persists and replays envelopes", {
  skip: !process.env.POSTGRES_URL,
}, async () => {
  const database = createPostgresDatabase(process.env.POSTGRES_URL!);
  const repository = new PostgresGovernanceEventRepository(database);
  const transactionHash = `0x${BigInt(Date.now()).toString(16).padStart(64, "0")}`;
  const contractAddress = "0x51b43885899bd0301c2beea89addc9d876145d21";
  const transactionSender = `0x${"ab".repeat(20)}`;
  const blockHash = `0x${"cd".repeat(32)}`;
  const blockTimestamp = "1785542400";
  const ingestionTimestamp = "2026-09-30T12:34:56.789Z";
  const finalizationArgs = {
    proposalId: "42",
    winningOption: "3",
    tied: true,
    totalVotes: "4294967295",
  };
  const first: GovernanceEventEnvelope = {
    evidenceId: `event:1212:${contractAddress}:${transactionHash}:10`,
    chainId: "1212",
    contractAddress,
    eventName: "ProposalFinalized",
    transactionHash,
    transactionIndex: 4,
    logIndex: 10,
    blockNumber: "16000000",
    blockHash,
    blockTimestamp,
    transactionSender,
    eventArgs: finalizationArgs,
    rawTopics: [`0x${"ef".repeat(32)}`],
    rawData: "0x",
    ingestionTimestamp,
  };
  const second: GovernanceEventEnvelope = {
    ...first,
    evidenceId: `event:1212:${contractAddress}:${transactionHash}:11`,
    eventName: "MemberAssigned",
    logIndex: 11,
    eventArgs: {
      proposalId: "42",
      member: `0x${"12".repeat(20)}`,
    },
  };

  try {
    await migratePostgresToLatest(database);
    await repository.saveGovernanceEvent(first);
    await repository.saveGovernanceEvent(first);
    await repository.saveGovernanceEvent(second);

    const stored = await repository.findGovernanceEventByEvidenceId(
      first.evidenceId,
    );
    assert.ok(stored);
    assert.equal(stored.eventName, "ProposalFinalized");
    assert.deepEqual(stored.eventArgs, finalizationArgs);
    assert.equal(stored.blockTimestamp, blockTimestamp);
    assert.equal(stored.ingestionTimestamp, ingestionTimestamp);
    assert.equal(stored.transactionSender, transactionSender);
    assert.notEqual(stored.transactionSender, stored.contractAddress);
    assert.equal(stored.canonical, true);

    const events = await repository.listGovernanceEvents({
      chainId: "1212",
      contractAddress,
      fromBlock: "16000000",
      toBlock: "16000000",
      limit: 10,
      offset: 0,
    });
    const matching = events.filter(
      (event) => event.transactionHash === transactionHash,
    );
    assert.deepEqual(
      matching.map((event) => event.logIndex),
      [10, 11],
    );
    assert.equal(await repository.eventExists(first.evidenceId), true);

    const count = await database
      .selectFrom("governance_events")
      .select(({ fn }) => fn.countAll<string>().as("count"))
      .where("transaction_hash", "=", transactionHash)
      .executeTakeFirstOrThrow();
    assert.equal(count.count, "2");
  } finally {
    await database
      .deleteFrom("governance_events")
      .where("transaction_hash", "=", transactionHash)
      .execute();
    await database.destroy();
  }
});
