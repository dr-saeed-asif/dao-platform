import { createPostgresDatabase } from "../src/index.js";

async function main(): Promise<void> {
  const database = createPostgresDatabase(process.env.POSTGRES_URL ?? "");

  try {
    const proposals = await database
      .selectFrom("proposals")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();
    const options = await database
      .selectFrom("proposal_options")
      .selectAll()
      .orderBy("proposal_id")
      .orderBy("option_index")
      .execute();
    const assignments = await database
      .selectFrom("proposal_assignments")
      .selectAll()
      .execute();
    const transactions = await database
      .selectFrom("chain_transactions")
      .selectAll()
       .orderBy("created_at", "desc")
      .execute();
    const votes = await database
      .selectFrom("votes")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();
    const indexerState = await database
      .selectFrom("indexer_checkpoints")
      .selectAll()
      .execute();
    console.log(
      JSON.stringify(
        { proposals, options, assignments, transactions, votes, indexerState },
        null,
        2,
      ),
    );
  } finally {
    await database.destroy();
  }
}

void main();
