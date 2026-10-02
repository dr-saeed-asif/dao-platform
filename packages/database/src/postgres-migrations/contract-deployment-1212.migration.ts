import { Kysely } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

const chainId = "1212";
const contractAddress = "0x51b43885899bd0301c2beea89addc9d876145d21";

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db
    .insertInto("contract_deployments")
    .values({
      chain_id: chainId,
      contract_address: contractAddress,
      deployment_tx_hash:
        "0xf161771c1b4d356ef03b2e18d7ad9202134a45283c66b1a4a7216759cf629ee8",
      deployment_block_number: "15463875",
      deployment_block_hash:
        "0x942427bcde6a4b59e71e41925192eb1089ca25bd77ab334b3cb14baa521686ef",
      deployment_timestamp: "2026-07-14T11:01:36.612Z",
      initial_owner: "0xb8163f7d6d404f67a400743b90f7952d2d137b8e",
      contract_version: null,
      abi_version: null,
      compiler_version: "0.8.36+commit.8a079791.Emscripten.clang",
      bytecode_hash:
        "43d2f0251f3da999086d73d2a550efea0f194385f4345ab14ec4a6fc6935b0b0",
      metadata: JSON.stringify({
        contractName: "CyberDAOGovernance",
        evmVersion: "london",
        gasUsed: "1413999",
        source: "deployments/cyber-dao-governance-1212.json",
      }),
    })
    .onConflict((conflict) =>
      conflict.columns(["chain_id", "contract_address"]).doNothing(),
    )
    .execute();
}

export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await db
    .deleteFrom("contract_deployments")
    .where("chain_id", "=", chainId)
    .where("contract_address", "=", contractAddress)
    .execute();
}
