import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { sql } from 'kysely';
import {
  createPostgresDatabase,
  migratePostgresToLatest,
  type PostgresDatabase,
  canonicalSerialize,
} from "../src/index.js";

type Row = Record<string, string | number | null>;
type ReportEntry = Record<string, unknown>;

const args = new Map<string, string>();
const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('Usage: npm run db:import-sqlite -- --sqlite PATH [--report PATH] [--dry-run]\nRequired environment: POSTGRES_URL, CYBERCHAIN_CHAIN_ID, GOVERNANCE_CONTRACT_ADDRESS.\nSQLite is opened read-only. PostgreSQL records win conflicts. Votes require indexed canonical VoteCast evidence.\nDry runs require a migrated PostgreSQL schema and roll back all trial inserts. Legacy indexer cursors are not trusted; replay canonical events instead.');
  process.exit(0);
}
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]!;
  const separator = arg.indexOf('=');
  if (separator >= 0) args.set(arg.slice(0, separator), arg.slice(separator + 1));
  else if (arg === '--dry-run') args.set(arg, 'true');
  else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) args.set(arg, argv[++i]!);
  else throw new Error(`Missing value for ${arg}. Use --sqlite PATH [--report PATH] [--dry-run].`);
}
const dryRun = args.has("--dry-run");
const invocationRoot = process.env.INIT_CWD ?? process.cwd();
const sqlitePath = resolve(invocationRoot, String(args.get("--sqlite") ?? "data/dao.db"));
const reportPath = resolve(invocationRoot, String(args.get("--report") ?? `migration-report-${Date.now()}.jsonl`));
const postgresUrl = process.env.POSTGRES_URL;
const chainId = process.env.CYBERCHAIN_CHAIN_ID;
const contractAddress = process.env.GOVERNANCE_CONTRACT_ADDRESS?.toLowerCase();

if (!postgresUrl) throw new Error("POSTGRES_URL is required.");
if (!chainId) throw new Error("CYBERCHAIN_CHAIN_ID is required.");
if (!contractAddress || !/^0x[0-9a-f]{40}$/.test(contractAddress)) {
  throw new Error("GOVERNANCE_CONTRACT_ADDRESS must be a normalized Ethereum address.");
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, "", "utf8");
const report = (entry: ReportEntry) => appendFileSync(reportPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`);
const counts = { inserted: 0, unchanged: 0, conflicts: 0, skipped: 0 };

function sourceRows(database: Database.Database, table: string): Row[] {
  if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) return [];
  return database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Row[];
}

function json(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function eventArgs(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return json(value);
  return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
}

function iso(value: unknown): Date {
  const result = new Date(String(value));
  if (Number.isNaN(result.getTime())) throw new Error(`Invalid timestamp: ${String(value)}`);
  return result;
}

function status(value: unknown): string {
  const legacy: Record<string, string> = { PENDING_ONCHAIN: 'PENDING', CLOSED: 'FINALIZED' };
  const normalized = legacy[String(value).toUpperCase()] ?? String(value).toUpperCase();
  return ["DRAFT", "PENDING", "ACTIVE", "VOTING_CLOSED", "CANCELLED", "FINALIZED"].includes(normalized)
    ? normalized : "PENDING";
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function findEvent(db: PostgresDatabase, name: string, txHash?: string, proposalId?: string) {
  let query = db.selectFrom("governance_events").selectAll()
    .where("chain_id", "=", chainId!)
    .where("contract_address", "=", contractAddress!)
    .where("event_name", "=", name)
    .where("canonical", "=", true);
  if (txHash) query = query.where("transaction_hash", "=", txHash.toLowerCase());
  const rows = await query.orderBy("log_index").execute();
  return rows.find((row) => proposalId === undefined || String(eventArgs(row.event_args).proposalId) === proposalId) ?? null;
}

async function insertOrReport(db: PostgresDatabase, table: "proposals" | "proposal_options" | "proposal_assignments" | "votes" | "chain_transactions", key: Record<string, unknown>, values: Record<string, unknown>, source: Row) {
  const predicates = Object.entries(key);
  let query = db.selectFrom(table).selectAll() as any;
  for (const [field, value] of predicates) query = query.where(field, "=", value);
  const existing = await query.executeTakeFirst();
  if (existing) {
    const comparable = (field: string, value: unknown) => field === 'metadata'
      ? canonicalSerialize(typeof value === 'string' ? JSON.parse(value) : value)
      : value instanceof Date ? value.toISOString() : String(value);
    const differences = Object.entries(values).filter(([field, value]) => field in existing && comparable(field, existing[field]) !== comparable(field, value));
    if (differences.length) {
      counts.conflicts += differences.length;
      for (const [field, value] of differences) report({ type: "conflict", table, key, field, sqliteValue: value, postgresValue: existing[field], resolution: "kept-postgresql", severity: "warning", source });
    } else {
      counts.unchanged++;
      report({ type: "record", table, key, action: "unchanged" });
    }
    return;
  }
  await (db.insertInto(table) as any).values(values).execute();
  counts.inserted++;
  report({ type: "record", table, key, action: dryRun ? "would-insert" : "inserted" });
}

async function run(): Promise<void> {
  const source = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  source.pragma("query_only = ON");
  const target = createPostgresDatabase(postgresUrl!);
  try {
    report({ type: "run", dryRun, sqlitePath, sqliteSha256: await sha256(sqlitePath), chainId, contractAddress });
    // Dry runs require an already migrated destination and roll back all trial inserts.
    if (!dryRun) await migratePostgresToLatest(target);
    const proposals = sourceRows(source, "proposals");
    const options = sourceRows(source, "proposal_options");
    const assignments = sourceRows(source, "proposal_assignments");
    const votes = sourceRows(source, "votes");
    const transactions = sourceRows(source, "chain_transactions");
    const checkpoints = sourceRows(source, "indexer_state");

    const rollback = new Error('dry-run rollback');
    await target.transaction().execute(async (transaction) => {
    const target = transaction as unknown as PostgresDatabase;
    const proposalIds = new Map<string, string>();
    for (const row of proposals) {
      const onChainId = row.on_chain_id === null ? null : String(row.on_chain_id);
      const created = onChainId ? await findEvent(target, "ProposalCreated", undefined, onChainId) : null;
      const args = eventArgs(created?.event_args);
      const cancelled = onChainId ? await findEvent(target, "ProposalCancelled", undefined, onChainId) : null;
      const finalized = onChainId ? await findEvent(target, "ProposalFinalized", undefined, onChainId) : null;
      const metadata = json(row.metadata_json);
      const finalArgs = eventArgs(finalized?.event_args);
      const effectiveStatus = finalized ? "FINALIZED" : cancelled ? "CANCELLED" : status(row.status);
      const existing = onChainId === null ? undefined : await target.selectFrom('proposals').select('id')
        .where('chain_id', '=', chainId!).where('contract_address', '=', contractAddress!).where('on_chain_id', '=', onChainId).executeTakeFirst();
      const id = existing?.id ?? String(row.id);
      proposalIds.set(String(row.id), id);
      const types: Record<string, string> = { '0': 'STANDARD', '1': 'TREASURY', '2': 'PARAMETER_CHANGE', '3': 'MEMBERSHIP', '255': 'OTHER' };
      const values = {
        id, dao_id: String(row.dao_id), idempotency_key: String(row.idempotency_key),
        on_chain_id: onChainId, chain_id: chainId!, contract_address: contractAddress!,
        creator_address: String(args.creator ?? row.creator_address).toLowerCase(),
        proposal_type: types[String(args.proposalType)] ?? String(row.proposal_type), title: String(row.title),
        purpose: String(row.purpose), description: String(row.description),
        metadata_uri: args.metadataURI ? String(args.metadataURI) : (metadata.metadataURI ? String(metadata.metadataURI) : null),
        metadata_hash: args.metadataHash ? String(args.metadataHash).toLowerCase() : (metadata.metadataHash ? String(metadata.metadataHash).toLowerCase() : null),
        metadata: JSON.stringify({ ...metadata, ...(args.metadataURI ? { metadataURI: args.metadataURI, metadataHash: args.metadataHash } : {}) }), starts_at: created ? new Date(Number(args.startsAt) * 1000) : iso(row.starts_at),
        ends_at: created ? new Date(Number(args.endsAt) * 1000) : iso(row.ends_at), status: effectiveStatus,
        cancelled_at: cancelled?.block_timestamp ?? null, finalized_at: finalized?.block_timestamp ?? null,
        winning_option: finalized ? Number(finalArgs.winningOption) : null, tied: finalized ? Boolean(finalArgs.tied) : null,
        total_votes: finalized ? String(finalArgs.totalVotes) : null, creation_evidence_id: created?.evidence_id ?? null,
        created_at: created?.block_timestamp ?? iso(row.created_at), updated_at: iso(row.updated_at),
      };
      await insertOrReport(target, "proposals", { id: values.id }, values, row);
    }

    for (const row of options) {
      const values = { proposal_id: proposalIds.get(String(row.proposal_id)) ?? String(row.proposal_id), option_index: Number(row.option_index), label: String(row.label) };
      await insertOrReport(target, "proposal_options", { proposal_id: values.proposal_id, option_index: values.option_index }, values, row);
    }

    for (const row of assignments) {
      const txHash = String(row.transaction_hash).toLowerCase();
      const proposalId = proposalIds.get(String(row.proposal_id)) ?? String(row.proposal_id);
      const proposal = await target.selectFrom('proposals').select('on_chain_id').where('id', '=', proposalId).executeTakeFirstOrThrow();
      const assignedEvent = await target.selectFrom('governance_events').selectAll()
        .where('chain_id', '=', chainId!).where('contract_address', '=', contractAddress!)
        .where('proposal_id', '=', proposal.on_chain_id).where('canonical', '=', true)
        .where('event_name', 'in', ['MemberAssigned', 'MemberUnassigned'])
        .where(sql<boolean>`event_args->>'member' = ${String(row.wallet_address).toLowerCase()}`)
        .orderBy('block_number', 'desc').orderBy('transaction_index', 'desc').orderBy('log_index', 'desc').executeTakeFirst();
      const values = {
        proposal_id: proposalId, member_address: String(eventArgs(assignedEvent?.event_args).member ?? row.wallet_address).toLowerCase(),
        assigned: assignedEvent?.event_name !== "MemberUnassigned", voting_weight: 1, transaction_hash: txHash,
        latest_evidence_id: assignedEvent?.evidence_id ?? null, effective_from: assignedEvent?.block_timestamp ?? iso(row.assigned_at), updated_at: iso(row.assigned_at),
      };
      await insertOrReport(target, "proposal_assignments", { proposal_id: values.proposal_id, member_address: values.member_address }, values, row);
    }

    for (const row of votes) {
      const txHash = String(row.transaction_hash).toLowerCase();
      const voteEvents = await target.selectFrom('governance_events').selectAll().where('chain_id', '=', chainId!)
        .where('contract_address', '=', contractAddress!).where('event_name', '=', 'VoteCast').where('canonical', '=', true)
        .where('transaction_hash', '=', txHash).where('proposal_id', '=', String(row.on_chain_proposal_id)).execute();
      const event = voteEvents.find(e => String(eventArgs(e.event_args).voter).toLowerCase() === String(row.voter_address).toLowerCase());
      if (!event) {
        counts.skipped++;
        report({ type: "conflict", table: "votes", key: { proposal_id: row.proposal_id, voter_address: row.voter_address }, field: "evidence_id", sqliteValue: null, postgresValue: null, resolution: "skipped-unverifiable-vote", severity: "error", source: row });
        continue;
      }
      const args = eventArgs(event.event_args);
      const values = {
        proposal_id: proposalIds.get(String(row.proposal_id)) ?? String(row.proposal_id), on_chain_proposal_id: String(args.proposalId ?? row.on_chain_proposal_id),
        voter_address: String(args.voter ?? row.voter_address).toLowerCase(), option_index: Number(args.optionIndex ?? args.option ?? row.option_index), voting_weight: 1,
        evidence_id: event.evidence_id, transaction_hash: event.transaction_hash, block_number: event.block_number,
        block_hash: event.block_hash, block_timestamp: event.block_timestamp, gas_used: String(row.gas_used), created_at: event.block_timestamp,
      };
      await insertOrReport(target, "votes", { proposal_id: values.proposal_id, voter_address: values.voter_address }, values, row);
    }

    for (const row of transactions) {
      const hash = String(row.transaction_hash).toLowerCase();
      const event = (await target.selectFrom("governance_events").selectAll().where('chain_id', '=', chainId!).where('contract_address', '=', contractAddress!).where("transaction_hash", "=", hash).where("canonical", "=", true).orderBy("log_index").executeTakeFirst());
      const values = {
        chain_id: chainId!, transaction_hash: hash, proposal_id: row.proposal_id ? proposalIds.get(String(row.proposal_id)) ?? String(row.proposal_id) : null,
        sender: String(event?.transaction_sender ?? row.wallet_address).toLowerCase(), recipient: event ? contractAddress! : null,
        block_number: event?.block_number ?? String(row.block_number), block_hash: event?.block_hash ?? String(row.block_hash).toLowerCase(),
        transaction_index: event?.transaction_index ?? null, receipt_status: String(row.status), gas_used: String(row.gas_used),
        operation: String(row.operation), created_at: iso(row.recorded_at), updated_at: iso(row.recorded_at),
      };
      await insertOrReport(target, "chain_transactions", { chain_id: chainId!, transaction_hash: hash }, values, row);
    }

    const coverage = await target.selectFrom("governance_events").select(({ fn }) => fn.max("block_number").as("max")).where("chain_id", "=", chainId!).where("contract_address", "=", contractAddress!).where("canonical", "=", true).executeTakeFirst();
    for (const row of checkpoints) {
      const cursor = String(row.last_processed_block);
      if (!coverage?.max || BigInt(String(coverage.max)) < BigInt(cursor)) {
        report({ type: "checkpoint", action: "skipped", indexerName: row.indexer_name, cursor, canonicalCoverage: coverage?.max ?? null, reason: "PostgreSQL governance_events do not cover the legacy cursor." });
      } else {
        report({ type: "checkpoint", action: "skipped", indexerName: row.indexer_name, cursor, canonicalCoverage: coverage.max, reason: "Checkpoint migration is intentionally manual after event replay verification." });
      }
    }

    const destinationCounts: Record<string, string> = {};
    for (const table of ["proposals", "proposal_options", "proposal_assignments", "votes", "chain_transactions"] as const) {
      const result = await (target.selectFrom(table) as any).select(({ fn }: any) => fn.countAll().as("count")).executeTakeFirstOrThrow();
      destinationCounts[table] = String(result.count);
    }
    report({ type: "summary", dryRun, sourceCounts: { proposals: proposals.length, proposal_options: options.length, proposal_assignments: assignments.length, votes: votes.length, chain_transactions: transactions.length, indexer_checkpoints: checkpoints.length }, destinationCounts, ...counts, validationPassed: counts.skipped === 0 });
    if (counts.skipped) process.exitCode = 2;
    if (dryRun) throw rollback;
    }).catch(error => { if (error !== rollback) throw error; });
    console.log(`SQLite import ${dryRun ? 'dry run' : 'complete'}: ${counts.inserted} inserted, ${counts.unchanged} unchanged, ${counts.conflicts} conflicts preserved, ${counts.skipped} unverifiable votes skipped. Report: ${reportPath}`);
  } finally {
    source.close();
    await target.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
