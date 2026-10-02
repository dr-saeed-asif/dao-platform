import type { ColumnType, Generated } from "kysely";

export type PostgresJsonValue =
  | null
  | boolean
  | number
  | string
  | PostgresJsonValue[]
  | { [key: string]: PostgresJsonValue };

export type PostgresBigInt = ColumnType<string, string | bigint, string | bigint>;
export type PostgresNumeric = ColumnType<string, string | bigint, string | bigint>;
export type PostgresTimestamp = ColumnType<Date, Date | string, Date | string>;
export type PostgresJson = ColumnType<PostgresJsonValue, string, string>;
type GeneratedPostgresJson = ColumnType<
  PostgresJsonValue,
  string | undefined,
  string
>;
type GeneratedPostgresTimestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

interface DatasetVersionsTable {
  id: Generated<string>;
  version: string;
  description: string;
  metadata: GeneratedPostgresJson;
  created_at: GeneratedPostgresTimestamp;
  chain_id: PostgresNumeric | null;
  contract_address: string | null;
  start_block: PostgresNumeric | null;
  end_block: PostgresNumeric | null;
  end_block_hash: string | null;
  policy_version: string | null;
  status: Generated<string>;
  frozen_at: PostgresTimestamp | null;
}

interface ContractDeploymentsTable {
  id: Generated<string>;
  chain_id: PostgresNumeric;
  contract_address: string;
  deployment_tx_hash: string;
  deployment_block_number: PostgresNumeric;
  deployment_block_hash: string;
  deployment_timestamp: PostgresTimestamp;
  initial_owner: string | null;
  contract_version: string | null;
  abi_version: string | null;
  compiler_version: string | null;
  bytecode_hash: string | null;
  metadata: GeneratedPostgresJson;
}

interface GovernanceEventsTable {
  id: Generated<string>;
  evidence_id: string;
  chain_id: PostgresNumeric;
  contract_address: string;
  event_name: string;
  transaction_hash: string;
  transaction_index: PostgresBigInt;
  log_index: PostgresBigInt;
  block_number: PostgresNumeric;
  block_hash: string;
  block_timestamp: PostgresTimestamp;
  transaction_sender: string;
  proposal_id: PostgresNumeric | null;
  event_args: PostgresJson;
  raw_topics: PostgresJson | null;
  raw_data: string | null;
  ingestion_timestamp: PostgresTimestamp;
  dataset_version_id: PostgresBigInt | null;
  canonical: Generated<boolean>;
}

interface ResearchPoliciesTable {
  id: Generated<string>;
  policy_version: string;
  quorum_policy: PostgresJson;
  approval_policy: PostgresJson;
  evidence_policy: PostgresJson;
  hash_algorithm: string;
  anomaly_configuration: PostgresJson;
  metadata: GeneratedPostgresJson;
  created_at: GeneratedPostgresTimestamp;
}

interface ArtefactsTable {
  id: Generated<string>;
  evidence_id: string;
  proposal_id: PostgresNumeric | null;
  source_type: string;
  uri: string;
  expected_hash: string | null;
  computed_hash: string | null;
  hash_algorithm: string | null;
  verification_status: string;
  title: string;
  content: string | null;
  metadata: GeneratedPostgresJson;
  dataset_version_id: PostgresBigInt | null;
  created_at: GeneratedPostgresTimestamp;
  filename: string | null;
  media_type: string | null;
  byte_size: PostgresBigInt | null;
  storage_key: string | null;
  lifecycle_state: Generated<string>;
  local_proposal_id: string | null;
}

interface ProvenanceEdgesTable {
  id: Generated<string>;
  from_evidence_id: string;
  to_evidence_id: string;
  relation_type: string;
  metadata: GeneratedPostgresJson;
  dataset_version_id: PostgresBigInt | null;
  created_at: GeneratedPostgresTimestamp;
}

interface QuestionsTable {
  id: Generated<string>;
  question_id: string;
  proposal_id: PostgresNumeric | null;
  category: string;
  question: string;
  canonical_answer: string;
  required_evidence_ids: PostgresJson;
  acceptable_alternative_evidence: PostgresJson | null;
  answerable: boolean;
  dataset_version_id: PostgresBigInt;
  metadata: GeneratedPostgresJson;
  created_at: GeneratedPostgresTimestamp;
}

interface ExperimentRunsTable {
  id: Generated<string>;
  run_id: string;
  system: string;
  dataset_version_id: PostgresBigInt;
  policy_id: PostgresBigInt | null;
  git_commit: string;
  chat_model: string | null;
  embedding_model: string | null;
  embedding_dimension: number | null;
  seed: PostgresBigInt;
  configuration: PostgresJson;
  started_at: PostgresTimestamp;
  completed_at: PostgresTimestamp | null;
  status: string;
  created_at: GeneratedPostgresTimestamp;
}

interface AnswersTable {
  id: Generated<string>;
  experiment_run_id: PostgresBigInt;
  question_id: PostgresBigInt;
  answer_text: string | null;
  raw_output: PostgresJson | null;
  latency_ms: PostgresBigInt | null;
  input_tokens: PostgresBigInt | null;
  output_tokens: PostgresBigInt | null;
  error: string | null;
  created_at: GeneratedPostgresTimestamp;
}

interface ClaimsTable {
  id: Generated<string>;
  answer_id: PostgresBigInt;
  claim_index: number;
  claim_text: string;
  evidence_ids: PostgresJson;
  support_status: string | null;
  verification_details: PostgresJson | null;
  created_at: GeneratedPostgresTimestamp;
}

interface RetrievalResultsTable {
  id: Generated<string>;
  experiment_run_id: PostgresBigInt;
  question_id: PostgresBigInt;
  rank: number;
  evidence_id: string;
  retrieval_method: string;
  score: number | null;
  metadata: PostgresJson | null;
  created_at: GeneratedPostgresTimestamp;
}

export interface OperationalProposalsTable {
  id: string;
  dao_id: string;
  idempotency_key: string;
  on_chain_id: PostgresNumeric | null;
  chain_id: PostgresNumeric;
  contract_address: string;
  creator_address: string;
  proposal_type: string;
  title: string;
  purpose: string;
  description: string;
  metadata_uri: string | null;
  metadata_hash: string | null;
  metadata: PostgresJson;
  starts_at: PostgresTimestamp;
  ends_at: PostgresTimestamp;
  status: string;
  cancelled_at: PostgresTimestamp | null;
  finalized_at: PostgresTimestamp | null;
  winning_option: number | null;
  tied: boolean | null;
  total_votes: PostgresNumeric | null;
  creation_evidence_id: string | null;
  created_at: PostgresTimestamp;
  updated_at: PostgresTimestamp;
}

export interface OperationalProposalOptionsTable {
  id: Generated<string>;
  proposal_id: string;
  option_index: number;
  label: string;
  created_at: GeneratedPostgresTimestamp;
}

export interface OperationalProposalAssignmentsTable {
  id: Generated<string>;
  proposal_id: string;
  member_address: string;
  assigned: Generated<boolean>;
  voting_weight: Generated<number>;
  transaction_hash: string | null;
  latest_evidence_id: string | null;
  effective_from: PostgresTimestamp | null;
  updated_at: PostgresTimestamp;
}

export interface OperationalVotesTable {
  id: Generated<string>;
  proposal_id: string;
  on_chain_proposal_id: PostgresNumeric;
  voter_address: string;
  option_index: number;
  voting_weight: Generated<number>;
  evidence_id: string;
  transaction_hash: string;
  block_number: PostgresNumeric;
  block_hash: string;
  block_timestamp: PostgresTimestamp;
  gas_used: PostgresNumeric | null;
  created_at: PostgresTimestamp;
}

export interface OperationalChainTransactionsTable {
  id: Generated<string>;
  chain_id: PostgresNumeric;
  transaction_hash: string;
  proposal_id: string | null;
  sender: string;
  recipient: string | null;
  block_number: PostgresNumeric | null;
  block_hash: string | null;
  transaction_index: PostgresBigInt | null;
  receipt_status: string;
  gas_used: PostgresNumeric | null;
  operation: string | null;
  created_at: PostgresTimestamp;
  updated_at: PostgresTimestamp;
}

export interface OperationalIndexerCheckpointsTable {
  id: Generated<string>;
  chain_id: PostgresNumeric;
  contract_address: string;
  indexer_name: string;
  indexer_version: string;
  processed_block_number: PostgresNumeric;
  processed_block_hash: string | null;
  updated_at: PostgresTimestamp;
}

interface DocumentChunksTable {
  id: Generated<string>;
  evidence_id: string;
  artefact_id: string;
  proposal_id: PostgresNumeric | null;
  chunk_index: number;
  content: string;
  metadata: PostgresJson;
  embedding: ColumnType<number[], string, string>;
  embedding_model: string;
  embedding_dimension: number;
  chunking_version: string;
  created_at: GeneratedPostgresTimestamp;
}

export interface PostgresDatabaseSchema {
  proposal_artefacts: { proposal_id: string; evidence_id: string; creation_evidence_id: string; created_at: GeneratedPostgresTimestamp };
  dataset_versions: DatasetVersionsTable;
  contract_deployments: ContractDeploymentsTable;
  governance_events: GovernanceEventsTable;
  research_policies: ResearchPoliciesTable;
  artefacts: ArtefactsTable;
  provenance_edges: ProvenanceEdgesTable;
  questions: QuestionsTable;
  experiment_runs: ExperimentRunsTable;
  answers: AnswersTable;
  claims: ClaimsTable;
  retrieval_results: RetrievalResultsTable;
  proposals: OperationalProposalsTable;
  proposal_options: OperationalProposalOptionsTable;
  proposal_assignments: OperationalProposalAssignmentsTable;
  votes: OperationalVotesTable;
  chain_transactions: OperationalChainTransactionsTable;
  indexer_checkpoints: OperationalIndexerCheckpointsTable;
  document_chunks: DocumentChunksTable;
}
