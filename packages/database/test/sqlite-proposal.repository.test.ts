import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { Proposal, ProposalType } from "@dao-platform/domain";
import { SqliteDatabase, SqliteProposalRepository } from "../src/index.js";

const databaseFiles: string[] = [];

afterEach(async () => {
  await Promise.all(
    databaseFiles.splice(0).map((file) => rm(file, { force: true })),
  );
});

describe("SqliteProposalRepository", () => {
  it("persists, rehydrates, lists, and idempotently finds proposals", async () => {
    const filename = resolve(
      tmpdir(),
      `dao-platform-${process.pid}-${Date.now()}.db`,
    );
    databaseFiles.push(filename);
    const database = new SqliteDatabase(`file:${filename}`);
    await database.migrateToLatest();
    const repository = new SqliteProposalRepository(database);
    const proposal = Proposal.create({
      id: "proposal-1",
      daoId: "dao-1",
      creatorAddress: "0xaabbccdd",
      title: "Fund security audit",
      purpose: "Improve protocol safety",
      description: "Fund an independent audit of governance contracts.",
      type: ProposalType.Treasury,
      optionLabels: ["Approve", "Reject"],
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-08-08T00:00:00.000Z"),
      metadata: { metadataURI: "ipfs://proposal" },
      now: new Date("2026-07-14T00:00:00.000Z"),
    });

    await database.runInTransaction(() =>
      repository.insert(proposal, { idempotencyKey: "request-1" }),
    );

    const stored = await repository.findById("proposal-1");
    assert.equal(stored?.title, proposal.title);
    assert.deepEqual(stored?.metadata, proposal.metadata);
    assert.equal(
      (await repository.findByIdempotencyKey("request-1"))?.id,
      proposal.id,
    );
    assert.equal((await repository.list(20, 0)).length, 1);
    await database.destroy();
  });
});
