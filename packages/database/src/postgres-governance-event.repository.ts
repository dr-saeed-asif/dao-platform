import type {
  GovernanceEventEnvelope,
  GovernanceEventName,
  GovernanceEventRepository,
  ListGovernanceEventsQuery,
  StoredGovernanceEvent,
} from "@dao-platform/application";
import type { Selectable } from "kysely";
import type { PostgresDatabase } from "./postgres-database.js";
import type { PostgresDatabaseSchema } from "./postgres-database-schema.js";

type GovernanceEventRow = Selectable<
  PostgresDatabaseSchema["governance_events"]
>;

export class PostgresGovernanceEventRepository
  implements GovernanceEventRepository
{
  constructor(private readonly database: PostgresDatabase) {}

  async saveGovernanceEvent(event: GovernanceEventEnvelope): Promise<void> {
    const transactionIndex = requiredIndex(
      event.transactionIndex,
      "transactionIndex",
    );
    if (!event.blockHash) throw new Error("Governance event blockHash is required.");
    if (!event.transactionSender) {
      throw new Error("Governance event transactionSender is required.");
    }

    await this.database
      .insertInto("governance_events")
      .values({
        evidence_id: event.evidenceId,
        chain_id: unsignedDecimal(event.chainId, "chainId"),
        contract_address: event.contractAddress,
        event_name: event.eventName,
        transaction_hash: event.transactionHash,
        transaction_index: transactionIndex.toString(),
        log_index: requiredIndex(event.logIndex, "logIndex").toString(),
        block_number: unsignedDecimal(event.blockNumber, "blockNumber"),
        block_hash: event.blockHash,
        block_timestamp: unixSecondsDate(event.blockTimestamp),
        transaction_sender: event.transactionSender,
        proposal_id: proposalId(event.eventArgs),
        event_args: JSON.stringify(event.eventArgs),
        raw_topics: event.rawTopics === undefined
          ? null
          : JSON.stringify(event.rawTopics),
        raw_data: event.rawData ?? null,
        ingestion_timestamp: timestamp(event.ingestionTimestamp),
        dataset_version_id: null,
        canonical: true,
      })
      .onConflict((conflict) => conflict.column("evidence_id").doNothing())
      .execute();
  }

  async findGovernanceEventByEvidenceId(
    evidenceId: string,
  ): Promise<StoredGovernanceEvent | null> {
    const row = await this.database
      .selectFrom("governance_events")
      .selectAll()
      .where("evidence_id", "=", evidenceId)
      .executeTakeFirst();
    return row ? toStoredEvent(row) : null;
  }

  async listGovernanceEvents(
    query: ListGovernanceEventsQuery,
  ): Promise<readonly StoredGovernanceEvent[]> {
    let statement = this.database.selectFrom("governance_events").selectAll();
    if (query.chainId !== undefined) {
      statement = statement.where(
        "chain_id",
        "=",
        unsignedDecimal(query.chainId, "chainId"),
      );
    }
    if (query.contractAddress !== undefined) {
      statement = statement.where(
        "contract_address",
        "=",
        query.contractAddress,
      );
    }
    if (query.proposalId !== undefined) {
      statement = statement.where(
        "proposal_id",
        "=",
        unsignedDecimal(query.proposalId, "proposalId"),
      );
    }
    if (query.eventName !== undefined) {
      statement = statement.where("event_name", "=", query.eventName);
    }
    if (query.canonical !== undefined) {
      statement = statement.where("canonical", "=", query.canonical);
    }
    if (query.fromBlock !== undefined) {
      statement = statement.where(
        "block_number",
        ">=",
        unsignedDecimal(query.fromBlock, "fromBlock"),
      );
    }
    if (query.toBlock !== undefined) {
      statement = statement.where(
        "block_number",
        "<=",
        unsignedDecimal(query.toBlock, "toBlock"),
      );
    }
    const rows = await statement
      .orderBy("block_number")
      .orderBy("transaction_index")
      .orderBy("log_index")
      .limit(nonnegativeInteger(query.limit, "limit"))
      .offset(nonnegativeInteger(query.offset, "offset"))
      .execute();
    return rows.map(toStoredEvent);
  }

  async eventExists(evidenceId: string): Promise<boolean> {
    const row = await this.database
      .selectFrom("governance_events")
      .select("id")
      .where("evidence_id", "=", evidenceId)
      .executeTakeFirst();
    return row !== undefined;
  }
}

function toStoredEvent(row: GovernanceEventRow): StoredGovernanceEvent {
  const eventArgs = row.event_args;
  if (!eventArgs || typeof eventArgs !== "object" || Array.isArray(eventArgs)) {
    throw new Error(`Invalid event_args for evidence ${row.evidence_id}.`);
  }
  const rawTopics = row.raw_topics;
  if (rawTopics !== null &&
      (!Array.isArray(rawTopics) || rawTopics.some((topic) => typeof topic !== "string"))) {
    throw new Error(`Invalid raw_topics for evidence ${row.evidence_id}.`);
  }
  const transactionIndex = Number(row.transaction_index);
  const logIndex = Number(row.log_index);
  requiredIndex(transactionIndex, "transactionIndex");
  requiredIndex(logIndex, "logIndex");

  return {
    evidenceId: row.evidence_id,
    chainId: row.chain_id,
    contractAddress: row.contract_address,
    eventName: row.event_name as GovernanceEventName,
    transactionHash: row.transaction_hash,
    transactionIndex,
    logIndex,
    blockNumber: row.block_number,
    blockHash: row.block_hash,
    blockTimestamp: Math.trunc(row.block_timestamp.getTime() / 1000).toString(),
    transactionSender: row.transaction_sender,
    eventArgs: eventArgs as Record<string, string | boolean>,
    ingestionTimestamp: row.ingestion_timestamp.toISOString(),
    canonical: row.canonical,
    ...(rawTopics === null ? {} : { rawTopics: rawTopics as string[] }),
    ...(row.raw_data === null ? {} : { rawData: row.raw_data }),
  };
}

function proposalId(
  eventArgs: Readonly<Record<string, string | boolean>>,
): string | null {
  const value = eventArgs.proposalId;
  return typeof value === "string"
    ? unsignedDecimal(value, "eventArgs.proposalId")
    : null;
}

function unsignedDecimal(value: string, field: string): string {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`Governance event ${field} must be an unsigned decimal string.`);
  }
  return value;
}

function requiredIndex(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Governance event ${field} must be a nonnegative safe integer.`);
  }
  return value;
}

function timestamp(value: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new Error("Governance event ingestionTimestamp is invalid.");
  }
  return result;
}

function unixSecondsDate(value: string): Date {
  const seconds = BigInt(unsignedDecimal(value, "blockTimestamp"));
  const milliseconds = seconds * 1000n;
  const result = new Date(Number(milliseconds));
  if (!Number.isSafeInteger(Number(milliseconds)) || Number.isNaN(result.getTime())) {
    throw new Error("Governance event blockTimestamp is outside the supported TIMESTAMPTZ range.");
  }
  return result;
}

function nonnegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative safe integer.`);
  }
  return value;
}
