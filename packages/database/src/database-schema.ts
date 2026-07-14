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
  proposal_assignments: ProposalAssignmentsTable;
  chain_transactions: ChainTransactionsTable;
  votes: VotesTable;
  indexer_state: IndexerStateTable;
  kysely_migration: SchemaMigrationsTable;
  kysely_migration_lock: { id: Generated<string>; is_locked: number };
}

export interface VotesTable {
  proposal_id: string;
  on_chain_proposal_id: string;
  voter_address: string;
  option_index: number;
  transaction_hash: string;
  block_number: string;
  block_hash: string;
  gas_used: string;
  confirmed_at: string;
}

export interface IndexerStateTable {
  indexer_name: string;
  last_processed_block: string;
  updated_at: string;
}

export interface ProposalAssignmentsTable {
  proposal_id: string;
  wallet_address: string;
  transaction_hash: string;
  assigned_at: string;
}

export interface ChainTransactionsTable {
  transaction_hash: string;
  operation: string;
  proposal_id: string;
  wallet_address: string;
  block_number: string;
  block_hash: string;
  gas_used: string;
  status: string;
  recorded_at: string;
}
