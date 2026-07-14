import type { Generated } from "kysely";

export interface ProposalsTable {
  id: string;
  dao_id: string;
  idempotency_key: string;
  on_chain_id: string | null;
  creator_address: string;
  title: string;
  purpose: string;
  description: string;
  proposal_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalOptionsTable {
  proposal_id: string;
  option_index: number;
  label: string;
}

export interface SchemaMigrationsTable {
  name: string;
  timestamp: string;
}

export interface DatabaseSchema {
  proposals: ProposalsTable;
  proposal_options: ProposalOptionsTable;
  kysely_migration: SchemaMigrationsTable;
  kysely_migration_lock: { id: Generated<string>; is_locked: number };
}
