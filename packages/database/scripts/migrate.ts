import { createPostgresDatabase, migratePostgresToLatest } from "../src/index.js";

async function main(): Promise<void> {
  const database = createPostgresDatabase(process.env.POSTGRES_URL ?? "");

  try {
    await migratePostgresToLatest(database);
    console.log("PostgreSQL migrations completed.");
  } finally {
    await database.destroy();
  }
}

void main();
