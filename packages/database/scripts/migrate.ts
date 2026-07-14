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
    console.log(`SQLite migrations completed: ${database.filename}`);
  } finally {
    await database.destroy();
  }
}

void main();
