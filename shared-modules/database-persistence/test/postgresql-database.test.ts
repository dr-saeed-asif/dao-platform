import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import {
  createPostgresDatabase,
  checkPostgresConnection,
  migratePostgresToLatest,
} from "../src/index.js";

test("PostgreSQL factory rejects missing configuration", () => {
  assert.throws(() => createPostgresDatabase(" "), /POSTGRES_URL/);
});

test("PostgreSQL factory is lazy and supports shutdown without connecting", async () => {
  const database = createPostgresDatabase("postgresql://localhost:1/unavailable");
  await database.destroy();
});

test("PostgreSQL connectivity errors propagate and allow shutdown", async () => {
  const database = createPostgresDatabase("postgresql://127.0.0.1:1/unavailable");
  try {
    await assert.rejects(checkPostgresConnection(database));
  } finally {
    await database.destroy();
  }
});

test("PostgreSQL SELECT 1 and pool shutdown", {
  skip: !process.env.POSTGRES_URL,
}, async () => {
  const database = createPostgresDatabase(process.env.POSTGRES_URL!);
  try {
    await checkPostgresConnection(database);
  } finally {
    await database.destroy();
  }
  await assert.rejects(checkPostgresConnection(database), /destroyed/);
});

test("PostgreSQL research schema migrates with expected tables and indexes", {
  skip: !process.env.POSTGRES_URL,
}, async () => {
  const database = createPostgresDatabase(process.env.POSTGRES_URL!);
  try {
    await migratePostgresToLatest(database);
    await migratePostgresToLatest(database);

    const tables = await sql<{ table_name: string }>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN (
          'dataset_versions', 'contract_deployments', 'governance_events',
          'research_policies', 'artefacts', 'provenance_edges', 'questions',
          'experiment_runs', 'answers', 'claims', 'retrieval_results',
          'proposals', 'proposal_options', 'proposal_assignments', 'votes',
          'chain_transactions', 'indexer_checkpoints'
        )
      ORDER BY table_name
    `.execute(database);
    assert.deepEqual(
      tables.rows.map((row) => row.table_name),
      [
        "answers",
        "artefacts",
        "chain_transactions",
        "claims",
        "contract_deployments",
        "dataset_versions",
        "experiment_runs",
        "governance_events",
        "indexer_checkpoints",
        "proposal_assignments",
        "proposal_options",
        "proposals",
        "provenance_edges",
        "questions",
        "research_policies",
        "retrieval_results",
        "votes",
      ],
    );

    const indexes = await sql<{ indexname: string }>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
    `.execute(database);
    const indexNames = new Set(indexes.rows.map((row) => row.indexname));
    for (const expected of [
      "dataset_versions_version_uq",
      "contract_deployments_chain_address_uq",
      "governance_events_evidence_id_uq",
      "governance_events_chain_event_uq",
      "research_policies_policy_version_uq",
      "artefacts_evidence_id_uq",
      "provenance_edges_identity_uq",
      "questions_question_id_uq",
      "experiment_runs_run_id_uq",
      "answers_run_question_uq",
      "claims_answer_claim_index_uq",
      "retrieval_results_run_question_method_rank_uq",
      "contract_deployments_chain_block_idx",
      "governance_events_canonical_chain_block_idx",
      "governance_events_canonical_proposal_idx",
      "governance_events_dataset_version_idx",
      "artefacts_dataset_proposal_idx",
      "provenance_edges_to_evidence_idx",
      "questions_dataset_category_idx",
      "experiment_runs_dataset_system_status_idx",
      "experiment_runs_policy_idx",
      "answers_question_idx",
      "retrieval_results_evidence_idx",
      "governance_events_event_args_gin_idx",
      "governance_events_raw_topics_gin_idx",
      "questions_required_evidence_ids_gin_idx",
      "claims_evidence_ids_gin_idx",
      "proposals_idempotency_key_uq",
      "proposals_chain_contract_on_chain_id_uq",
      "proposals_creation_evidence_id_uq",
      "proposal_options_proposal_index_uq",
      "proposal_assignments_proposal_member_uq",
      "proposal_assignments_latest_evidence_id_uq",
      "votes_proposal_voter_uq",
      "votes_evidence_id_uq",
      "chain_transactions_chain_hash_uq",
      "indexer_checkpoints_scope_uq",
      "proposals_dao_created_idx",
      "proposals_deployment_status_starts_idx",
      "proposals_open_ends_idx",
      "proposal_assignments_active_proposal_idx",
      "votes_proposal_created_idx",
      "votes_transaction_hash_idx",
      "chain_transactions_proposal_created_idx",
      "chain_transactions_chain_block_idx",
    ]) {
      assert.ok(indexNames.has(expected), `Missing index ${expected}`);
    }
  } finally {
    await database.destroy();
  }
});

test("PostgreSQL governance events preserve numeric and JSONB values", {
  skip: !process.env.POSTGRES_URL,
}, async () => {
  const database = createPostgresDatabase(process.env.POSTGRES_URL!);
  const rollback = new Error("rollback test data");
  const uint256Max =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  const address = `0x${"ab".repeat(20)}`;
  const transactionHash = `0x${"cd".repeat(32)}`;
  const blockHash = `0x${"ef".repeat(32)}`;
  try {
    await assert.rejects(
      database.transaction().execute(async (transaction) => {
        const dataset = await transaction
          .insertInto("dataset_versions")
          .values({
            version: "postgres-schema-test",
            description: "Rolled-back schema integration test",
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        await transaction
          .insertInto("contract_deployments")
          .values({
            chain_id: uint256Max,
            contract_address: address,
            deployment_tx_hash: transactionHash,
            deployment_block_number: uint256Max,
            deployment_block_hash: blockHash,
            deployment_timestamp: "2026-09-30T00:00:00.000Z",
            initial_owner: null,
            contract_version: null,
            abi_version: null,
            compiler_version: null,
            bytecode_hash: null,
          })
          .execute();
        await transaction
          .insertInto("governance_events")
          .values({
            evidence_id: `event:${uint256Max}:${address}:${transactionHash}:0`,
            chain_id: uint256Max,
            contract_address: address,
            event_name: "ProposalCreated",
            transaction_hash: transactionHash,
            transaction_index: "0",
            log_index: "0",
            block_number: uint256Max,
            block_hash: blockHash,
            block_timestamp: "2026-09-30T00:00:00.000Z",
            transaction_sender: address,
            proposal_id: uint256Max,
            event_args: JSON.stringify({ proposalId: uint256Max }),
            raw_topics: JSON.stringify([transactionHash]),
            raw_data: "0x",
            ingestion_timestamp: "2026-09-30T00:00:01.000Z",
            dataset_version_id: dataset.id,
          })
          .execute();

        const event = await transaction
          .selectFrom("governance_events")
          .select(["chain_id", "proposal_id", "event_args", "block_timestamp"])
          .where("evidence_id", "=", `event:${uint256Max}:${address}:${transactionHash}:0`)
          .executeTakeFirstOrThrow();
        assert.equal(event.chain_id, uint256Max);
        assert.equal(event.proposal_id, uint256Max);
        assert.deepEqual(event.event_args, { proposalId: uint256Max });
        assert.ok(event.block_timestamp instanceof Date);
        throw rollback;
      }),
      rollback,
    );
  } finally {
    await database.destroy();
  }
});

test("PostgreSQL governance event identities are independently unique", {
  skip: !process.env.POSTGRES_URL,
}, async () => {
  const database = createPostgresDatabase(process.env.POSTGRES_URL!);
  const address = `0x${"12".repeat(20)}`;
  const transactionHash = `0x${"34".repeat(32)}`;
  const blockHash = `0x${"56".repeat(32)}`;
  const event = {
    evidence_id: `event:1212:${address}:${transactionHash}:1`,
    chain_id: "1212",
    contract_address: address,
    event_name: "VoteCast",
    transaction_hash: transactionHash,
    transaction_index: "0",
    log_index: "1",
    block_number: "1",
    block_hash: blockHash,
    block_timestamp: "2026-09-30T00:00:00.000Z",
    transaction_sender: address,
    proposal_id: "1",
    event_args: JSON.stringify({ proposalId: "1", optionIndex: "0" }),
    raw_topics: null,
    raw_data: null,
    ingestion_timestamp: "2026-09-30T00:00:01.000Z",
  } as const;
  try {
    for (const duplicate of [
      { ...event, transaction_hash: `0x${"78".repeat(32)}` },
      { ...event, evidence_id: `${event.evidence_id}:different` },
    ]) {
      await assert.rejects(
        database.transaction().execute(async (transaction) => {
          await transaction
            .insertInto("contract_deployments")
            .values({
              chain_id: event.chain_id,
              contract_address: event.contract_address,
              deployment_tx_hash: transactionHash,
              deployment_block_number: "1",
              deployment_block_hash: blockHash,
              deployment_timestamp: event.block_timestamp,
              initial_owner: null,
              contract_version: null,
              abi_version: null,
              compiler_version: null,
              bytecode_hash: null,
            })
            .execute();
          await transaction.insertInto("governance_events").values(event).execute();
          await transaction
            .insertInto("governance_events")
            .values(duplicate)
            .execute();
        }),
        /duplicate key value violates unique constraint/,
      );
    }
  } finally {
    await database.destroy();
  }
});
