import { Kysely, SqlBool, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

const uint256 = sql`numeric(78, 0)`;
const emptyObject = sql`'{}'::jsonb`;
const now = sql`CURRENT_TIMESTAMP`;

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("dataset_versions")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("version", "text", (column) => column.notNull())
    .addColumn("description", "text", (column) => column.notNull())
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(emptyObject),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("dataset_versions_version_uq", ["version"])
    .execute();

  await db.schema
    .createTable("contract_deployments")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("chain_id", uint256, (column) => column.notNull())
    .addColumn("contract_address", "text", (column) => column.notNull())
    .addColumn("deployment_tx_hash", "text", (column) => column.notNull())
    .addColumn("deployment_block_number", uint256, (column) => column.notNull())
    .addColumn("deployment_block_hash", "text", (column) => column.notNull())
    .addColumn("deployment_timestamp", "timestamptz", (column) =>
      column.notNull(),
    )
    .addColumn("initial_owner", "text")
    .addColumn("contract_version", "text")
    .addColumn("abi_version", "text")
    .addColumn("compiler_version", "text")
    .addColumn("bytecode_hash", "text")
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(emptyObject),
    )
    .addUniqueConstraint("contract_deployments_chain_address_uq", [
      "chain_id",
      "contract_address",
    ])
    .addCheckConstraint("contract_deployments_chain_id_ck", sql`chain_id >= 0`)
    .addCheckConstraint(
      "contract_deployments_block_number_ck",
      sql`deployment_block_number >= 0`,
    )
    .addCheckConstraint(
      "contract_deployments_address_ck",
      sql`contract_address ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "contract_deployments_tx_hash_ck",
      sql`deployment_tx_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "contract_deployments_block_hash_ck",
      sql`deployment_block_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "contract_deployments_initial_owner_ck",
      sql`initial_owner IS NULL OR initial_owner ~ '^0x[0-9a-f]{40}$'`,
    )
    .execute();

  await db.schema
    .createTable("research_policies")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("policy_version", "text", (column) => column.notNull())
    .addColumn("quorum_policy", "jsonb", (column) => column.notNull())
    .addColumn("approval_policy", "jsonb", (column) => column.notNull())
    .addColumn("evidence_policy", "jsonb", (column) => column.notNull())
    .addColumn("hash_algorithm", "text", (column) => column.notNull())
    .addColumn("anomaly_configuration", "jsonb", (column) => column.notNull())
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(emptyObject),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("research_policies_policy_version_uq", [
      "policy_version",
    ])
    .execute();

  await db.schema
    .createTable("governance_events")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("evidence_id", "text", (column) => column.notNull())
    .addColumn("chain_id", uint256, (column) => column.notNull())
    .addColumn("contract_address", "text", (column) => column.notNull())
    .addColumn("event_name", "text", (column) => column.notNull())
    .addColumn("transaction_hash", "text", (column) => column.notNull())
    .addColumn("transaction_index", "bigint", (column) => column.notNull())
    .addColumn("log_index", "bigint", (column) => column.notNull())
    .addColumn("block_number", uint256, (column) => column.notNull())
    .addColumn("block_hash", "text", (column) => column.notNull())
    .addColumn("block_timestamp", "timestamptz", (column) => column.notNull())
    .addColumn("transaction_sender", "text", (column) => column.notNull())
    .addColumn("proposal_id", uint256)
    .addColumn("event_args", "jsonb", (column) => column.notNull())
    .addColumn("raw_topics", "jsonb")
    .addColumn("raw_data", "text")
    .addColumn("ingestion_timestamp", "timestamptz", (column) =>
      column.notNull(),
    )
    .addColumn("dataset_version_id", "bigint", (column) =>
      column.references("dataset_versions.id"),
    )
    .addColumn("canonical", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addUniqueConstraint("governance_events_evidence_id_uq", ["evidence_id"])
    .addUniqueConstraint("governance_events_chain_event_uq", [
      "chain_id",
      "contract_address",
      "transaction_hash",
      "log_index",
    ])
    .addForeignKeyConstraint(
      "governance_events_deployment_fk",
      ["chain_id", "contract_address"],
      "contract_deployments",
      ["chain_id", "contract_address"],
    )
    .addCheckConstraint("governance_events_chain_id_ck", sql`chain_id >= 0`)
    .addCheckConstraint(
      "governance_events_transaction_index_ck",
      sql`transaction_index >= 0`,
    )
    .addCheckConstraint("governance_events_log_index_ck", sql`log_index >= 0`)
    .addCheckConstraint("governance_events_block_number_ck", sql`block_number >= 0`)
    .addCheckConstraint(
      "governance_events_proposal_id_ck",
      sql`proposal_id IS NULL OR proposal_id >= 0`,
    )
    .addCheckConstraint(
      "governance_events_address_ck",
      sql`contract_address ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "governance_events_transaction_hash_ck",
      sql`transaction_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "governance_events_block_hash_ck",
      sql`block_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "governance_events_sender_ck",
      sql`transaction_sender ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "governance_events_raw_data_ck",
      sql`raw_data IS NULL OR raw_data ~ '^0x(?:[0-9a-f]{2})*$'`,
    )
    .execute();

  await db.schema
    .createTable("artefacts")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("evidence_id", "text", (column) => column.notNull())
    .addColumn("proposal_id", uint256)
    .addColumn("source_type", "text", (column) => column.notNull())
    .addColumn("uri", "text", (column) => column.notNull())
    .addColumn("expected_hash", "text")
    .addColumn("computed_hash", "text")
    .addColumn("hash_algorithm", "text")
    .addColumn("verification_status", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("content", "text")
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(emptyObject),
    )
    .addColumn("dataset_version_id", "bigint", (column) =>
      column.notNull().references("dataset_versions.id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("artefacts_evidence_id_uq", ["evidence_id"])
    .addCheckConstraint(
      "artefacts_proposal_id_ck",
      sql`proposal_id IS NULL OR proposal_id >= 0`,
    )
    .execute();

  await db.schema
    .createTable("provenance_edges")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("from_evidence_id", "text", (column) => column.notNull())
    .addColumn("to_evidence_id", "text", (column) => column.notNull())
    .addColumn("relation_type", "text", (column) => column.notNull())
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(emptyObject),
    )
    .addColumn("dataset_version_id", "bigint", (column) =>
      column.notNull().references("dataset_versions.id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("provenance_edges_identity_uq", [
      "dataset_version_id",
      "from_evidence_id",
      "to_evidence_id",
      "relation_type",
    ])
    .execute();

  await db.schema
    .createTable("questions")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("question_id", "text", (column) => column.notNull())
    .addColumn("proposal_id", uint256)
    .addColumn("category", "text", (column) => column.notNull())
    .addColumn("question", "text", (column) => column.notNull())
    .addColumn("canonical_answer", "text", (column) => column.notNull())
    .addColumn("required_evidence_ids", "jsonb", (column) => column.notNull())
    .addColumn("acceptable_alternative_evidence", "jsonb")
    .addColumn("answerable", "boolean", (column) => column.notNull())
    .addColumn("dataset_version_id", "bigint", (column) =>
      column.notNull().references("dataset_versions.id"),
    )
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(emptyObject),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("questions_question_id_uq", ["question_id"])
    .addCheckConstraint(
      "questions_proposal_id_ck",
      sql`proposal_id IS NULL OR proposal_id >= 0`,
    )
    .addCheckConstraint(
      "questions_required_evidence_ids_ck",
      sql`jsonb_typeof(required_evidence_ids) = 'array'`,
    )
    .addCheckConstraint(
      "questions_alternative_evidence_ck",
      sql`acceptable_alternative_evidence IS NULL OR jsonb_typeof(acceptable_alternative_evidence) = 'array'`,
    )
    .execute();

  await db.schema
    .createTable("experiment_runs")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("run_id", "text", (column) => column.notNull())
    .addColumn("system", "text", (column) => column.notNull())
    .addColumn("dataset_version_id", "bigint", (column) =>
      column.notNull().references("dataset_versions.id"),
    )
    .addColumn("policy_id", "bigint", (column) =>
      column.references("research_policies.id"),
    )
    .addColumn("git_commit", "text", (column) => column.notNull())
    .addColumn("chat_model", "text")
    .addColumn("embedding_model", "text")
    .addColumn("embedding_dimension", "integer")
    .addColumn("seed", "bigint", (column) => column.notNull())
    .addColumn("configuration", "jsonb", (column) => column.notNull())
    .addColumn("started_at", "timestamptz", (column) => column.notNull())
    .addColumn("completed_at", "timestamptz")
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("experiment_runs_run_id_uq", ["run_id"])
    .addCheckConstraint(
      "experiment_runs_embedding_dimension_ck",
      sql`embedding_dimension IS NULL OR embedding_dimension > 0`,
    )
    .addCheckConstraint(
      "experiment_runs_completed_at_ck",
      sql`completed_at IS NULL OR completed_at >= started_at`,
    )
    .execute();

  await db.schema
    .createTable("answers")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("experiment_run_id", "bigint", (column) =>
      column.notNull().references("experiment_runs.id").onDelete("cascade"),
    )
    .addColumn("question_id", "bigint", (column) =>
      column.notNull().references("questions.id"),
    )
    .addColumn("answer_text", "text")
    .addColumn("raw_output", "jsonb")
    .addColumn("latency_ms", "bigint")
    .addColumn("input_tokens", "bigint")
    .addColumn("output_tokens", "bigint")
    .addColumn("error", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("answers_run_question_uq", [
      "experiment_run_id",
      "question_id",
    ])
    .addCheckConstraint(
      "answers_latency_ms_ck",
      sql`latency_ms IS NULL OR latency_ms >= 0`,
    )
    .addCheckConstraint(
      "answers_input_tokens_ck",
      sql`input_tokens IS NULL OR input_tokens >= 0`,
    )
    .addCheckConstraint(
      "answers_output_tokens_ck",
      sql`output_tokens IS NULL OR output_tokens >= 0`,
    )
    .execute();

  await db.schema
    .createTable("claims")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("answer_id", "bigint", (column) =>
      column.notNull().references("answers.id").onDelete("cascade"),
    )
    .addColumn("claim_index", "integer", (column) => column.notNull())
    .addColumn("claim_text", "text", (column) => column.notNull())
    .addColumn("evidence_ids", "jsonb", (column) => column.notNull())
    .addColumn("support_status", "text")
    .addColumn("verification_details", "jsonb")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("claims_answer_claim_index_uq", [
      "answer_id",
      "claim_index",
    ])
    .addCheckConstraint("claims_claim_index_ck", sql`claim_index >= 0`)
    .addCheckConstraint(
      "claims_evidence_ids_ck",
      sql`jsonb_typeof(evidence_ids) = 'array'`,
    )
    .execute();

  await db.schema
    .createTable("retrieval_results")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("experiment_run_id", "bigint", (column) =>
      column.notNull().references("experiment_runs.id").onDelete("cascade"),
    )
    .addColumn("question_id", "bigint", (column) =>
      column.notNull().references("questions.id"),
    )
    .addColumn("rank", "integer", (column) => column.notNull())
    .addColumn("evidence_id", "text", (column) => column.notNull())
    .addColumn("retrieval_method", "text", (column) => column.notNull())
    .addColumn("score", "double precision")
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("retrieval_results_run_question_method_rank_uq", [
      "experiment_run_id",
      "question_id",
      "retrieval_method",
      "rank",
    ])
    .addCheckConstraint("retrieval_results_rank_ck", sql`rank > 0`)
    .execute();

  await db.schema
    .createIndex("contract_deployments_chain_block_idx")
    .on("contract_deployments")
    .columns(["chain_id", "deployment_block_number"])
    .execute();
  await db.schema
    .createIndex("governance_events_canonical_chain_block_idx")
    .on("governance_events")
    .columns([
      "chain_id",
      "contract_address",
      "block_number",
      "transaction_index",
      "log_index",
    ])
    .where(sql<SqlBool>`canonical = true`)
    .execute();
  await db.schema
    .createIndex("governance_events_canonical_proposal_idx")
    .on("governance_events")
    .columns([
      "chain_id",
      "contract_address",
      "proposal_id",
      "block_number",
      "log_index",
    ])
    .where(sql<SqlBool>`canonical = true`)
    .where(sql<SqlBool>`proposal_id IS NOT NULL`)
    .execute();
  await db.schema
    .createIndex("governance_events_dataset_version_idx")
    .on("governance_events")
    .column("dataset_version_id")
    .where("dataset_version_id", "is not", null)
    .execute();
  await db.schema
    .createIndex("artefacts_dataset_proposal_idx")
    .on("artefacts")
    .columns(["dataset_version_id", "proposal_id"])
    .where("proposal_id", "is not", null)
    .execute();
  await db.schema
    .createIndex("provenance_edges_to_evidence_idx")
    .on("provenance_edges")
    .column("to_evidence_id")
    .execute();
  await db.schema
    .createIndex("questions_dataset_category_idx")
    .on("questions")
    .columns(["dataset_version_id", "category", "answerable"])
    .execute();
  await db.schema
    .createIndex("experiment_runs_dataset_system_status_idx")
    .on("experiment_runs")
    .columns(["dataset_version_id", "system", "status"])
    .execute();
  await db.schema
    .createIndex("experiment_runs_policy_idx")
    .on("experiment_runs")
    .column("policy_id")
    .where("policy_id", "is not", null)
    .execute();
  await db.schema
    .createIndex("answers_question_idx")
    .on("answers")
    .column("question_id")
    .execute();
  await db.schema
    .createIndex("retrieval_results_evidence_idx")
    .on("retrieval_results")
    .column("evidence_id")
    .execute();
  await db.schema
    .createIndex("governance_events_event_args_gin_idx")
    .on("governance_events")
    .using("gin")
    .column("event_args")
    .execute();
  await db.schema
    .createIndex("governance_events_raw_topics_gin_idx")
    .on("governance_events")
    .using("gin")
    .column("raw_topics")
    .where("raw_topics", "is not", null)
    .execute();
  await db.schema
    .createIndex("questions_required_evidence_ids_gin_idx")
    .on("questions")
    .using("gin")
    .column("required_evidence_ids")
    .execute();
  await db.schema
    .createIndex("claims_evidence_ids_gin_idx")
    .on("claims")
    .using("gin")
    .column("evidence_ids")
    .execute();
}

export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema.dropTable("retrieval_results").ifExists().execute();
  await db.schema.dropTable("claims").ifExists().execute();
  await db.schema.dropTable("answers").ifExists().execute();
  await db.schema.dropTable("experiment_runs").ifExists().execute();
  await db.schema.dropTable("questions").ifExists().execute();
  await db.schema.dropTable("provenance_edges").ifExists().execute();
  await db.schema.dropTable("artefacts").ifExists().execute();
  await db.schema.dropTable("governance_events").ifExists().execute();
  await db.schema.dropTable("research_policies").ifExists().execute();
  await db.schema.dropTable("contract_deployments").ifExists().execute();
  await db.schema.dropTable("dataset_versions").ifExists().execute();
}
