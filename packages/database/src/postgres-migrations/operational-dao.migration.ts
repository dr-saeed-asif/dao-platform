import { Kysely, SqlBool, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

const uint256 = sql`numeric(78, 0)`;
const now = sql`CURRENT_TIMESTAMP`;
const emptyObject = sql`'{}'::jsonb`;

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("proposals")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("dao_id", "text", (column) => column.notNull())
    .addColumn("idempotency_key", "text", (column) => column.notNull())
    .addColumn("on_chain_id", uint256)
    .addColumn("chain_id", uint256, (column) => column.notNull())
    .addColumn("contract_address", "text", (column) => column.notNull())
    .addColumn("creator_address", "text", (column) => column.notNull())
    .addColumn("proposal_type", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("purpose", "text", (column) => column.notNull())
    .addColumn("description", "text", (column) => column.notNull())
    .addColumn("metadata_uri", "text")
    .addColumn("metadata_hash", "text")
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(emptyObject),
    )
    .addColumn("starts_at", "timestamptz", (column) => column.notNull())
    .addColumn("ends_at", "timestamptz", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("finalized_at", "timestamptz")
    .addColumn("winning_option", "integer")
    .addColumn("tied", "boolean")
    .addColumn("total_votes", uint256)
    .addColumn("creation_evidence_id", "text", (column) =>
      column.references("governance_events.evidence_id"),
    )
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("proposals_idempotency_key_uq", ["idempotency_key"])
    .addForeignKeyConstraint(
      "proposals_deployment_fk",
      ["chain_id", "contract_address"],
      "contract_deployments",
      ["chain_id", "contract_address"],
    )
    .addCheckConstraint("proposals_chain_id_ck", sql`chain_id >= 0`)
    .addCheckConstraint(
      "proposals_on_chain_id_ck",
      sql`on_chain_id IS NULL OR on_chain_id >= 0`,
    )
    .addCheckConstraint(
      "proposals_contract_address_ck",
      sql`contract_address ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "proposals_creator_address_ck",
      sql`creator_address ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "proposals_metadata_hash_ck",
      sql`metadata_hash IS NULL OR metadata_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint("proposals_period_ck", sql`ends_at > starts_at`)
    .addCheckConstraint(
      "proposals_status_ck",
      sql`status IN ('DRAFT', 'PENDING', 'ACTIVE', 'VOTING_CLOSED', 'CANCELLED', 'FINALIZED')`,
    )
    .addCheckConstraint(
      "proposals_winning_option_ck",
      sql`winning_option IS NULL OR winning_option >= 0`,
    )
    .addCheckConstraint(
      "proposals_total_votes_ck",
      sql`total_votes IS NULL OR total_votes >= 0`,
    )
    .execute();

  await db.schema
    .createTable("proposal_options")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("proposal_id", "text", (column) =>
      column.notNull().references("proposals.id").onDelete("cascade"),
    )
    .addColumn("option_index", "integer", (column) => column.notNull())
    .addColumn("label", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(now),
    )
    .addUniqueConstraint("proposal_options_proposal_index_uq", [
      "proposal_id",
      "option_index",
    ])
    .addCheckConstraint(
      "proposal_options_option_index_ck",
      sql`option_index >= 0`,
    )
    .execute();

  await db.schema
    .createTable("proposal_assignments")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("proposal_id", "text", (column) =>
      column.notNull().references("proposals.id").onDelete("cascade"),
    )
    .addColumn("member_address", "text", (column) => column.notNull())
    .addColumn("assigned", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("voting_weight", "integer", (column) =>
      column.notNull().defaultTo(1),
    )
    .addColumn("transaction_hash", "text")
    .addColumn("latest_evidence_id", "text", (column) =>
      column.references("governance_events.evidence_id"),
    )
    .addColumn("effective_from", "timestamptz")
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("proposal_assignments_proposal_member_uq", [
      "proposal_id",
      "member_address",
    ])
    .addCheckConstraint(
      "proposal_assignments_member_address_ck",
      sql`member_address ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "proposal_assignments_voting_weight_ck",
      sql`voting_weight = 1`,
    )
    .addCheckConstraint(
      "proposal_assignments_transaction_hash_ck",
      sql`transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .execute();

  await db.schema
    .createTable("votes")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("proposal_id", "text", (column) =>
      column.notNull().references("proposals.id").onDelete("cascade"),
    )
    .addColumn("on_chain_proposal_id", uint256, (column) => column.notNull())
    .addColumn("voter_address", "text", (column) => column.notNull())
    .addColumn("option_index", "integer", (column) => column.notNull())
    .addColumn("voting_weight", "integer", (column) =>
      column.notNull().defaultTo(1),
    )
    .addColumn("evidence_id", "text", (column) =>
      column.notNull().references("governance_events.evidence_id"),
    )
    .addColumn("transaction_hash", "text", (column) => column.notNull())
    .addColumn("block_number", uint256, (column) => column.notNull())
    .addColumn("block_hash", "text", (column) => column.notNull())
    .addColumn("block_timestamp", "timestamptz", (column) => column.notNull())
    .addColumn("gas_used", uint256)
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("votes_proposal_voter_uq", [
      "proposal_id",
      "voter_address",
    ])
    .addUniqueConstraint("votes_evidence_id_uq", ["evidence_id"])
    .addForeignKeyConstraint(
      "votes_proposal_option_fk",
      ["proposal_id", "option_index"],
      "proposal_options",
      ["proposal_id", "option_index"],
    )
    .addCheckConstraint(
      "votes_on_chain_proposal_id_ck",
      sql`on_chain_proposal_id >= 0`,
    )
    .addCheckConstraint("votes_option_index_ck", sql`option_index >= 0`)
    .addCheckConstraint("votes_voting_weight_ck", sql`voting_weight = 1`)
    .addCheckConstraint(
      "votes_voter_address_ck",
      sql`voter_address ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "votes_transaction_hash_ck",
      sql`transaction_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint("votes_block_number_ck", sql`block_number >= 0`)
    .addCheckConstraint(
      "votes_block_hash_ck",
      sql`block_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "votes_gas_used_ck",
      sql`gas_used IS NULL OR gas_used >= 0`,
    )
    .execute();

  await db.schema
    .createTable("chain_transactions")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("chain_id", uint256, (column) => column.notNull())
    .addColumn("transaction_hash", "text", (column) => column.notNull())
    .addColumn("proposal_id", "text", (column) =>
      column.references("proposals.id").onDelete("set null"),
    )
    .addColumn("sender", "text", (column) => column.notNull())
    .addColumn("recipient", "text")
    .addColumn("block_number", uint256)
    .addColumn("block_hash", "text")
    .addColumn("transaction_index", "bigint")
    .addColumn("receipt_status", "text", (column) => column.notNull())
    .addColumn("gas_used", uint256)
    .addColumn("operation", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("chain_transactions_chain_hash_uq", [
      "chain_id",
      "transaction_hash",
    ])
    .addCheckConstraint("chain_transactions_chain_id_ck", sql`chain_id >= 0`)
    .addCheckConstraint(
      "chain_transactions_transaction_hash_ck",
      sql`transaction_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "chain_transactions_sender_ck",
      sql`sender ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "chain_transactions_recipient_ck",
      sql`recipient IS NULL OR recipient ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "chain_transactions_block_number_ck",
      sql`block_number IS NULL OR block_number >= 0`,
    )
    .addCheckConstraint(
      "chain_transactions_block_hash_ck",
      sql`block_hash IS NULL OR block_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "chain_transactions_transaction_index_ck",
      sql`transaction_index IS NULL OR transaction_index >= 0`,
    )
    .addCheckConstraint(
      "chain_transactions_receipt_status_ck",
      sql`receipt_status IN ('PENDING', 'CONFIRMED', 'REVERTED', 'UNKNOWN')`,
    )
    .addCheckConstraint(
      "chain_transactions_gas_used_ck",
      sql`gas_used IS NULL OR gas_used >= 0`,
    )
    .execute();

  await db.schema
    .createTable("indexer_checkpoints")
    .addColumn("id", "bigint", (column) =>
      column.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("chain_id", uint256, (column) => column.notNull())
    .addColumn("contract_address", "text", (column) => column.notNull())
    .addColumn("indexer_name", "text", (column) => column.notNull())
    .addColumn("indexer_version", "text", (column) => column.notNull())
    .addColumn("processed_block_number", uint256, (column) => column.notNull())
    .addColumn("processed_block_hash", "text")
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("indexer_checkpoints_scope_uq", [
      "chain_id",
      "contract_address",
      "indexer_name",
      "indexer_version",
    ])
    .addForeignKeyConstraint(
      "indexer_checkpoints_deployment_fk",
      ["chain_id", "contract_address"],
      "contract_deployments",
      ["chain_id", "contract_address"],
    )
    .addCheckConstraint("indexer_checkpoints_chain_id_ck", sql`chain_id >= 0`)
    .addCheckConstraint(
      "indexer_checkpoints_contract_address_ck",
      sql`contract_address ~ '^0x[0-9a-f]{40}$'`,
    )
    .addCheckConstraint(
      "indexer_checkpoints_block_number_ck",
      sql`processed_block_number >= 0`,
    )
    .addCheckConstraint(
      "indexer_checkpoints_block_hash_ck",
      sql`processed_block_hash IS NULL OR processed_block_hash ~ '^0x[0-9a-f]{64}$'`,
    )
    .execute();

  await db.schema
    .createIndex("proposals_chain_contract_on_chain_id_uq")
    .unique()
    .on("proposals")
    .columns(["chain_id", "contract_address", "on_chain_id"])
    .where(sql<SqlBool>`on_chain_id IS NOT NULL`)
    .execute();
  await db.schema
    .createIndex("proposals_creation_evidence_id_uq")
    .unique()
    .on("proposals")
    .column("creation_evidence_id")
    .where("creation_evidence_id", "is not", null)
    .execute();
  await db.schema
    .createIndex("proposal_assignments_latest_evidence_id_uq")
    .unique()
    .on("proposal_assignments")
    .column("latest_evidence_id")
    .where("latest_evidence_id", "is not", null)
    .execute();
  await db.schema
    .createIndex("proposals_dao_created_idx")
    .on("proposals")
    .columns(["dao_id", "created_at"])
    .execute();
  await db.schema
    .createIndex("proposals_deployment_status_starts_idx")
    .on("proposals")
    .columns(["chain_id", "contract_address", "status", "starts_at"])
    .execute();
  await db.schema
    .createIndex("proposals_open_ends_idx")
    .on("proposals")
    .column("ends_at")
    .where(sql<SqlBool>`status IN ('PENDING', 'ACTIVE')`)
    .execute();
  await db.schema
    .createIndex("proposal_assignments_active_proposal_idx")
    .on("proposal_assignments")
    .columns(["proposal_id", "member_address"])
    .where(sql<SqlBool>`assigned = true`)
    .execute();
  await db.schema
    .createIndex("votes_proposal_created_idx")
    .on("votes")
    .columns(["proposal_id", "created_at"])
    .execute();
  await db.schema
    .createIndex("votes_transaction_hash_idx")
    .on("votes")
    .column("transaction_hash")
    .execute();
  await db.schema
    .createIndex("chain_transactions_proposal_created_idx")
    .on("chain_transactions")
    .columns(["proposal_id", "created_at"])
    .where("proposal_id", "is not", null)
    .execute();
  await db.schema
    .createIndex("chain_transactions_chain_block_idx")
    .on("chain_transactions")
    .columns(["chain_id", "block_number", "transaction_index"])
    .where("block_number", "is not", null)
    .execute();
}

export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db.schema.dropTable("indexer_checkpoints").ifExists().execute();
  await db.schema.dropTable("chain_transactions").ifExists().execute();
  await db.schema.dropTable("votes").ifExists().execute();
  await db.schema.dropTable("proposal_assignments").ifExists().execute();
  await db.schema.dropTable("proposal_options").ifExists().execute();
  await db.schema.dropTable("proposals").ifExists().execute();
}
