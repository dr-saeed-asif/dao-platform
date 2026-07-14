import { Kysely } from "kysely";
import { DatabaseSchema } from "../database-schema.js";

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("proposal_assignments")
    .addColumn("proposal_id", "text", (column) =>
      column.notNull().references("proposals.id").onDelete("cascade"),
    )
    .addColumn("wallet_address", "text", (column) => column.notNull())
    .addColumn("transaction_hash", "text", (column) => column.notNull())
    .addColumn("assigned_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("proposal_assignments_pk", [
      "proposal_id",
      "wallet_address",
    ])
    .execute();

  await db.schema
    .createTable("chain_transactions")
    .addColumn("transaction_hash", "text", (column) => column.primaryKey())
    .addColumn("operation", "text", (column) => column.notNull())
    .addColumn("proposal_id", "text", (column) =>
      column.notNull().references("proposals.id").onDelete("cascade"),
    )
    .addColumn("wallet_address", "text", (column) => column.notNull())
    .addColumn("block_number", "text", (column) => column.notNull())
    .addColumn("block_hash", "text", (column) => column.notNull())
    .addColumn("gas_used", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("recorded_at", "text", (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema.dropTable("chain_transactions").ifExists().execute();
  await db.schema.dropTable("proposal_assignments").ifExists().execute();
}
