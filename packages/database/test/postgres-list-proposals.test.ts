import assert from "node:assert/strict";
import test from "node:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import {
  PostgresOperationalDatabase,
  PostgresProposalRepository,
  type PostgresDatabaseSchema,
  type ProposalListQuery,
} from "../src/index.js";

// Session-local tables shadow production tables. No migrations or persistent writes.
test(
  "listProposals filters, counts and scopes against PostgreSQL",
  {
    skip: !process.env.POSTGRES_URL,
  },
  async () => {
    const db = new Kysely<PostgresDatabaseSchema>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.POSTGRES_URL,
          max: 1,
          connectionTimeoutMillis: 5000,
        }),
      }),
    });
    const chain = "1212",
      contract = `0x${"11".repeat(20)}`;
    const repository = new PostgresProposalRepository(
      new PostgresOperationalDatabase(db),
      chain,
      contract,
    );
    const now = new Date("2026-10-08T12:00:00Z");
    const base: ProposalListQuery = {
      status: null,
      from: null,
      to: null,
      limit: 20,
      offset: 0,
    };
    const list = (query: Partial<ProposalListQuery> = {}, daoId = "dao-a") =>
      repository.listFiltered({ ...base, ...query }, now, daoId);
    try {
      await sql`CREATE TEMP TABLE proposals (
      id text PRIMARY KEY, dao_id text, on_chain_id numeric, chain_id numeric,
      contract_address text, title text, creator_address text, status text,
      starts_at timestamptz, ends_at timestamptz, cancelled_at timestamptz,
      finalized_at timestamptz, created_at timestamptz, updated_at timestamptz,
      creation_evidence_id text
    )`.execute(db);
      await sql`CREATE TEMP TABLE proposal_assignments (proposal_id text, assigned boolean)`.execute(
        db,
      );
      await sql`CREATE TEMP TABLE votes (proposal_id text)`.execute(db);
      const fixtures = [
        { id: "a-start", start: now, end: new Date("2026-10-09T12:00:00Z") },
        { id: "b-end", start: new Date("2026-10-07T12:00:00Z"), end: now },
        {
          id: "c-upcoming",
          start: new Date("2026-10-09T12:00:00Z"),
          end: new Date("2026-10-10T12:00:00Z"),
        },
        {
          id: "d-ended",
          start: new Date("2026-10-06T12:00:00Z"),
          end: new Date("2026-10-07T12:00:00Z"),
        },
        { id: "e-cancelled", cancelled: now },
        { id: "f-finalized", finalized: now },
        { id: "g-other-dao", dao: "dao-b" },
        { id: "h-other-chain", chain: "9999" },
        { id: "i-other-contract", contract: `0x${"22".repeat(20)}` },
      ];
      for (const [index, fixture] of fixtures.entries()) {
        await sql`INSERT INTO proposals VALUES (
        ${fixture.id}, ${fixture.dao ?? "dao-a"}, ${String(index + 1)},
        ${fixture.chain ?? chain}, ${fixture.contract ?? contract},
        ${"Proposal " + fixture.id}, ${contract}, 'ACTIVE',
        ${fixture.start ?? new Date("2026-10-07T12:00:00Z")},
        ${fixture.end ?? new Date("2026-10-09T12:00:00Z")},
        ${fixture.cancelled ?? null}, ${fixture.finalized ?? null}, ${now}, ${now}, NULL
      )`.execute(db);
      }
      await sql`INSERT INTO proposal_assignments VALUES ('a-start', true), ('a-start', true), ('a-start', true), ('a-start', false)`.execute(
        db,
      );
      await sql`INSERT INTO votes VALUES ('a-start'), ('a-start')`.execute(db);

      const active = await list({ status: "ACTIVE", limit: 1 });
      assert.equal(active.count, 2);
      assert.equal(active.proposals.length, 1);
      assert.equal(active.proposals[0]?.proposalId, "a-start");
      assert.equal(active.proposals[0]?.memberCount, 3);
      assert.equal(active.proposals[0]?.voteCount, 2);
      assert.equal(active.proposals[0]?.status, "ACTIVE");
      assert.equal(active.query.asOf, now.toISOString());
      assert.equal(active.query.daoId, "dao-a");
      const second = await list({ status: "ACTIVE", limit: 1, offset: 1 });
      assert.equal(second.count, 2);
      assert.equal(second.proposals[0]?.proposalId, "b-end");
      assert.equal(second.proposals[0]?.memberCount, 0);
      const beyond = await list({ status: "ACTIVE", offset: 100 });
      assert.equal(beyond.count, 2);
      assert.deepEqual(beyond.proposals, []);
      assert.equal(
        (await list({ status: "UPCOMING" })).proposals[0]?.proposalId,
        "c-upcoming",
      );
      assert.deepEqual(
        (await list({ status: "ENDED" })).proposals.map((p) => p.status),
        ["ENDED", "CANCELLED", "FINALIZED"],
      );
      assert.equal((await list({ status: "CANCELLED" })).count, 1);
      assert.equal((await list({ status: "FINALIZED" })).count, 1);
      assert.equal((await list()).count, 6);
      assert.equal((await list({}, "dao-b")).count, 1);
      assert.equal((await list({}, "absent")).count, 0);
      assert.equal(
        (await list({ from: now.toISOString(), to: now.toISOString() })).count,
        1,
      );
      assert.equal((await list({ to: "2020-01-01T00:00:00Z" })).count, 0);
      assert.equal((await repository.listFiltered(base, now)).count, 7);
      assert.equal(
        (await repository.findStructuredEvidence("a-start"))?.id,
        "a-start",
      );
      assert.equal(
        await repository.findStructuredEvidence("h-other-chain"),
        undefined,
      );
    } finally {
      await db.destroy();
    }
  },
);
