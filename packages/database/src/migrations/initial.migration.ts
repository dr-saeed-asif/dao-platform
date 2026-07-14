import { Kysely, sql } from "kysely";
import { DatabaseSchema } from "../database-schema.js";

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("proposals")
    .ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("dao_id", "text", (column) => column.notNull())
    .addColumn("idempotency_key", "text", (column) => column.notNull().unique())
    .addColumn("on_chain_id", "text")
    .addColumn("creator_address", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("purpose", "text", (column) => column.notNull())
    .addColumn("description", "text", (column) => column.notNull())
    .addColumn("proposal_type", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("starts_at", "text", (column) => column.notNull())
    .addColumn("ends_at", "text", (column) => column.notNull())
    .addColumn("metadata_json", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createIndex("proposals_dao_created_idx")
    .ifNotExists()
    .on("proposals")
    .columns(["dao_id", "created_at"])
    .execute();

  await db.schema
    .createTable("proposal_options")
    .ifNotExists()
    .addColumn("proposal_id", "text", (column) =>
      column.notNull().references("proposals.id").onDelete("cascade"),
    )
    .addColumn("option_index", "integer", (column) => column.notNull())
    .addColumn("label", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("proposal_options_pk", [
      "proposal_id",
      "option_index",
    ])
    .execute();

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema.dropTable("proposal_options").ifExists().execute();
  await db.schema.dropTable("proposals").ifExists().execute();
}
