import { Kysely } from "kysely";
import { DatabaseSchema } from "../database-schema.js";

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("votes")
    .addColumn("proposal_id", "text", (column) =>
      column.notNull().references("proposals.id").onDelete("cascade"),
    )
    .addColumn("on_chain_proposal_id", "text", (column) => column.notNull())
    .addColumn("voter_address", "text", (column) => column.notNull())
    .addColumn("option_index", "integer", (column) => column.notNull())
    .addColumn("transaction_hash", "text", (column) =>
      column.notNull().unique(),
    )
    .addColumn("block_number", "text", (column) => column.notNull())
    .addColumn("block_hash", "text", (column) => column.notNull())
    .addColumn("gas_used", "text", (column) => column.notNull())
    .addColumn("confirmed_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("votes_proposal_voter_pk", [
      "proposal_id",
      "voter_address",
    ])
    .execute();
  await db.schema
    .createTable("indexer_state")
    .addColumn("indexer_name", "text", (column) => column.primaryKey())
    .addColumn("last_processed_block", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema.dropTable("indexer_state").ifExists().execute();
  await db.schema.dropTable("votes").ifExists().execute();
}
