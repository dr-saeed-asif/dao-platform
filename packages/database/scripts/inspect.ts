import { resolve } from "node:path";
import { SqliteDatabase } from "../src/index.js";

async function main(): Promise<void> {
  const repositoryRoot = resolve(process.cwd(), "../..");
  const database = new SqliteDatabase(
    process.env.DATABASE_URL ?? "file:./data/dao.db",
    repositoryRoot,
  );

  try {
    await database.migrateToLatest();
    const proposals = await database.db
      .selectFrom("proposals")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();
    const options = await database.db
      .selectFrom("proposal_options")
      .selectAll()
      .orderBy("proposal_id")
      .orderBy("option_index")
      .execute();
    console.log(JSON.stringify({ proposals, options }, null, 2));
  } finally {
    await database.destroy();
  }
}

void main();
