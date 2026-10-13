import { createWriteStream, WriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

export type Severity = "info" | "warning" | "error";

export interface MigrationReportEntry {
  run_id: string;
  timestamp: string;
  step: string;
  source_table: string;
  source_record_id: string;
  destination_table: string;
  destination_record_id: string;
  action: string;
  conflict_type: string | null;
  field: string | null;
  sqlite_value: string | null;
  blockchain_value: string | null;
  resolution: string;
  reason: string | null;
  severity: Severity;
  details: string | null;
}

export interface MigrationSummary {
  run_id: string;
  type: "summary";
  timestamp: string;
  proposals: TableSummary;
  proposal_options: TableSummary;
  proposal_assignments: TableSummary;
  votes: TableSummary;
  chain_transactions: TableSummary;
  indexer_checkpoints: TableSummary;
  duration_ms: number;
}

export interface TableSummary {
  sqlite_count: number;
  pg_count: number;
  inserted: number;
  updated: number;
  unchanged: number;
  reconciled: number;
  unverified: number;
  conflicts: number;
  errors: number;
}

export interface MigrationMetadata {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  sqlite_path: string;
  sqlite_hash: string | null;
  git_commit: string | null;
  pg_target: string;
  chain_id: string;
  contract_address: string;
}

export class MigrationReporter {
  private stream: WriteStream | null = null;
  private runId: string;
  private startedAt: Date;
  private counts: Map<string, TableSummary> = new Map();
  private metadata: MigrationMetadata;
  private reportPath: string;

  constructor(
    reportPath: string,
    sqlitePath: string,
    pgUrl: string,
    chainId: string,
    contractAddress: string,
    gitCommit: string | null = null,
    sqliteHash: string | null = null,
  ) {
    this.runId = randomUUID();
    this.startedAt = new Date();
    this.reportPath = reportPath;
    this.metadata = {
      run_id: this.runId,
      started_at: this.startedAt.toISOString(),
      completed_at: null,
      sqlite_path: sqlitePath,
      sqlite_hash: sqliteHash,
      git_commit: gitCommit,
      pg_target: this.sanitizePgUrl(pgUrl),
      chain_id: chainId,
      contract_address: contractAddress,
    };
    this.initCounts();
  }

  private sanitizePgUrl(url: string): string {
    try {
      const u = new URL(url);
      u.password = "***";
      return u.toString();
    } catch {
      return "invalid-url";
    }
  }

  private initCounts(): void {
    const tables = [
      "proposals",
      "proposal_options",
      "proposal_assignments",
      "votes",
      "chain_transactions",
      "indexer_checkpoints",
    ];
    for (const table of tables) {
      this.counts.set(table, {
        sqlite_count: 0,
        pg_count: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        reconciled: 0,
        unverified: 0,
        conflicts: 0,
        errors: 0,
      });
    }
  }

  open(): void {
    this.stream = createWriteStream(this.reportPath, { flags: "w" });
    this.writeMetadata();
  }

  private writeMetadata(): void {
    if (!this.stream) return;
    this.stream.write(JSON.stringify(this.metadata) + "\n");
  }

  record(entry: Omit<MigrationReportEntry, "run_id" | "timestamp">): void {
    if (!this.stream) return;
    const fullEntry: MigrationReportEntry = {
      ...entry,
      run_id: this.runId,
      timestamp: new Date().toISOString(),
    };
    this.stream.write(JSON.stringify(fullEntry) + "\n");
    this.updateCounts(entry);
  }

  private updateCounts(entry: Omit<MigrationReportEntry, "run_id" | "timestamp">): void {
    const table = entry.destination_table;
    const current = this.counts.get(table);
    if (!current) return;

    current.pg_count += 1;

    switch (entry.action) {
      case "insert":
        current.inserted += 1;
        break;
      case "update":
        current.updated += 1;
        break;
      case "unchanged":
        current.unchanged += 1;
        break;
    }

    if (entry.conflict_type === "reconciled") {
      current.reconciled += 1;
    }
    if (entry.conflict_type === "unverified") {
      current.unverified += 1;
    }
    if (entry.severity === "warning" || entry.severity === "error") {
      current.conflicts += 1;
    }
    if (entry.severity === "error") {
      current.errors += 1;
    }
  }

  incrementSqliteCount(table: string): void {
    const current = this.counts.get(table);
    if (current) {
      current.sqlite_count += 1;
    }
  }

  close(): MigrationSummary {
    if (!this.stream) {
      throw new Error("Reporter not opened");
    }
    const completedAt = new Date();
    this.metadata.completed_at = completedAt.toISOString();
    this.stream.write(JSON.stringify(this.metadata) + "\n");

    const summary: MigrationSummary = {
      run_id: this.runId,
      type: "summary",
      timestamp: completedAt.toISOString(),
      proposals: this.counts.get("proposals")!,
      proposal_options: this.counts.get("proposal_options")!,
      proposal_assignments: this.counts.get("proposal_assignments")!,
      votes: this.counts.get("votes")!,
      chain_transactions: this.counts.get("chain_transactions")!,
      indexer_checkpoints: this.counts.get("indexer_checkpoints")!,
      duration_ms: completedAt.getTime() - this.startedAt.getTime(),
    };

    this.stream.write(JSON.stringify(summary) + "\n");
    this.stream.end();
    return summary;
  }

  getRunId(): string {
    return this.runId;
  }

  getReportPath(): string {
    return this.reportPath;
  }
}

export function generateReportPath(customPath?: string): string {
  if (customPath) return customPath;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(process.cwd(), "migration-report-" + timestamp + ".jsonl");
}
