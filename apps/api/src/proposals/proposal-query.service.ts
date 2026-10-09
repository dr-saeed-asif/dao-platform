import { Inject, Injectable } from '@nestjs/common';
import type {
  PostgresProposalRepository,
  PostgresAssignmentRepository,
  PostgresChainTransactionRepository,
  ProposalListQuery,
  DaoStatisticsQuery,
  DaoStatisticsResult,
  GetProposalMembersQuery,
  GetProposalMembersResult,
  GetContractDeploymentResult,
  GetProposalDetailsQuery,
  GetProposalDetailsResult,
  GetProposalVotesQuery,
  GetProposalVotesResult,
  GetMemberActivityQuery,
  GetMemberActivityResult,
  GetIndexerStatusQuery,
  GetIndexerStatusResult,
  PostgresVoteRepository,
  PostgresGovernanceEventRepository,
  PostgresOperationalDatabase,
} from '@dao-platform/database';
import { RecordChainTransactionInput } from '@dao-platform/application';
import { PROPOSAL_REPOSITORY, ASSIGNMENT_REPOSITORY, CHAIN_TRANSACTION_REPOSITORY, VOTE_REPOSITORY, OPERATIONAL_DATABASE } from './proposals.tokens';
import { GOVERNANCE_EVENT_REPOSITORY } from '../database/database.tokens';
import type { StoredGovernanceEvent } from '@dao-platform/application';
import type { PostgresSyncStateRepository } from '@dao-platform/database';

export interface ProposalTimelineResult {
  found: boolean;
  proposalId: string;
  onChainProposalId: string | null;
  events: Array<{
    evidenceId: string;
    eventName: string;
    transactionHash: string;
    transactionIndex: number;
    logIndex: number;
    blockNumber: string;
    blockHash: string;
    blockTimestamp: string;
    transactionSender: string;
    eventArgs: Record<string, string | boolean>;
  }>;
  asOf: string;
  chainId: string;
  contractAddress: string;
  daoId: string | null;
  evidenceIds: string[];
}

export interface ProposalEvidenceResult {
  found: boolean;
  proposalId: string;
  onChainProposalId: string | null;
  evidenceIds: string[];
  asOf: string;
  chainId: string;
  contractAddress: string;
  daoId: string | null;
}

export interface EvidenceLookupResult {
  evidenceId: string;
  valid: boolean;
  sourceType: 'governance-event' | 'artefact' | 'document-chunk' | 'unknown';
  proposalId: string | null;
  lineage: Record<string, unknown> | null;
  relatedEvidence: string[];
  warnings: string[];
}

@Injectable()
export class ProposalQueryService {
  constructor(
    @Inject(PROPOSAL_REPOSITORY)
    private readonly proposals: PostgresProposalRepository,
    @Inject(ASSIGNMENT_REPOSITORY)
    private readonly assignments: PostgresAssignmentRepository,
    @Inject(CHAIN_TRANSACTION_REPOSITORY)
    private readonly transactions: PostgresChainTransactionRepository,
    @Inject(VOTE_REPOSITORY)
    private readonly votes: PostgresVoteRepository,
    @Inject(GOVERNANCE_EVENT_REPOSITORY)
    private readonly governanceEvents: PostgresGovernanceEventRepository,
    @Inject(OPERATIONAL_DATABASE)
    private readonly database: PostgresOperationalDatabase,
  ) {}

  listProposals(query: ProposalListQuery, daoId?: string) {
    return this.proposals.listFiltered(query, new Date(), daoId);
  }

  getDaoStatistics(daoId?: string): Promise<DaoStatisticsResult> {
    const asOf = new Date();
    return this.proposals.getDaoStatistics({ daoId: daoId ?? null }, asOf);
  }

  async getProposalMembers(
    query: GetProposalMembersQuery,
  ): Promise<GetProposalMembersResult> {
    const asOf = new Date();
    // Resolve proposal by local ID or on-chain ID
    let proposal = await this.proposals.findById(query.proposalId);
    if (!proposal && /^\d+$/.test(query.proposalId)) {
      proposal = await this.proposals.findByOnChainId(query.proposalId);
    }
    if (!proposal) {
      return {
        found: false,
        proposalId: query.proposalId,
        onChainProposalId: null,
        count: 0,
        totalVotingPower: 0,
        members: [],
        asOf: asOf.toISOString(),
        chainId: this.proposals.getChainId(),
        contractAddress: this.proposals.getContractAddress(),
        daoId: query.daoId ?? null,
        evidenceIds: [],
      };
    }
    // Verify DAO scope if provided
    if (query.daoId !== null && proposal.daoId !== query.daoId) {
      return {
        found: false,
        proposalId: proposal.id,
        onChainProposalId: proposal.onChainId,
        count: 0,
        totalVotingPower: 0,
        members: [],
        asOf: asOf.toISOString(),
        chainId: this.proposals.getChainId(),
        contractAddress: this.proposals.getContractAddress(),
        daoId: query.daoId ?? null,
        evidenceIds: [],
      };
    }
    // Get current members (assigned = true)
    const assignments = await this.assignments.listDetailed(proposal.id);
    const members = assignments.map((a) => ({
      address: a.walletAddress,
      votingPower: a.votingWeight,
    }));
    const totalVotingPower = members.reduce((sum, m) => sum + m.votingPower, 0);
    return {
      proposalId: proposal.id,
      onChainProposalId: proposal.onChainId,
      count: members.length,
      totalVotingPower,
      members,
      asOf: asOf.toISOString(),
      chainId: this.proposals.getChainId(),
      contractAddress: this.proposals.getContractAddress(),
      daoId: proposal.daoId,
      evidenceIds: assignments.flatMap((a) => a.evidenceId ? [a.evidenceId] : []),
      found: true,
    };
  }

  async getProposalDetails(query: GetProposalDetailsQuery): Promise<GetProposalDetailsResult> {
    const asOf = new Date();
    const proposal = await this.resolveProposal(query.proposalId, query.daoId);
    const base = {
      chainId: this.proposals.getChainId(),
      contractAddress: this.proposals.getContractAddress(),
      asOf: asOf.toISOString(),
      daoId: query.daoId,
      evidenceIds: [] as string[],
    };
    if (!proposal) return {
      ...base, found: false, proposalId: query.proposalId, onChainProposalId: null,
      title: null, purpose: null, description: null, creator: null, status: null,
      startsAt: null, endsAt: null, options: [], memberCount: 0, voteCount: 0,
      creationEvidenceId: null,
    };
    const [assignments, votes] = await Promise.all([
      this.assignments.list(proposal.id),
      this.votes.list(proposal.id),
    ]);
    const creationEvidenceId = await this.proposals.findCreationEvidenceIdForQuery(proposal.id);
    const evidenceIds = creationEvidenceId ? [creationEvidenceId] : [];
    return {
      ...base,
      found: true,
      proposalId: proposal.id,
      onChainProposalId: proposal.onChainId,
      daoId: proposal.daoId,
      title: proposal.title,
      purpose: proposal.purpose,
      description: proposal.description,
      creator: proposal.creatorAddress.value,
      status: proposal.status,
      startsAt: proposal.startsAt.toISOString(),
      endsAt: proposal.endsAt.toISOString(),
      options: proposal.options.map((option) => ({ optionIndex: option.index, label: option.label })),
      memberCount: assignments.length,
      voteCount: votes.length,
      creationEvidenceId,
      evidenceIds,
    };
  }

  async getProposalVotes(query: GetProposalVotesQuery): Promise<GetProposalVotesResult> {
    const asOf = new Date();
    const proposal = await this.resolveProposal(query.proposalId, query.daoId);
    const base = {
      chainId: this.proposals.getChainId(), contractAddress: this.proposals.getContractAddress(),
      asOf: asOf.toISOString(), daoId: query.daoId,
    };
    if (!proposal) return {
      ...base, found: false, proposalId: query.proposalId, onChainProposalId: null,
      count: 0, totalVotingPower: 0, votes: [], optionTotals: [], winningOption: null,
      tied: false, evidenceIds: [],
    };
    const [rawVotes, details] = await Promise.all([
      this.votes.listDetailed(proposal.id),
      Promise.resolve(proposal.options),
    ]);
    const labels = new Map(details.map((option) => [option.index, option.label]));
    const votes = rawVotes.map((vote) => ({ ...vote, optionLabel: labels.get(vote.optionIndex) ?? null }));
    const totals = [...new Map(votes.map((vote) => [vote.optionIndex, {
      optionIndex: vote.optionIndex,
      optionLabel: vote.optionLabel,
      voteCount: 0,
      totalVotingPower: 0,
    }])).values()];
    for (const vote of votes) {
      const total = totals.find((item) => item.optionIndex === vote.optionIndex)!;
      total.voteCount += 1;
      total.totalVotingPower += vote.votingPower;
    }
    totals.sort((a, b) => a.optionIndex - b.optionIndex);
    const max = totals.length ? Math.max(...totals.map((item) => item.totalVotingPower)) : 0;
    const leaders = totals.filter((item) => item.totalVotingPower === max && max > 0);
    return {
      ...base, found: true, proposalId: proposal.id, onChainProposalId: proposal.onChainId,
      count: votes.length, totalVotingPower: votes.reduce((sum, vote) => sum + vote.votingPower, 0),
      votes, optionTotals: totals, winningOption: leaders.length === 1 ? leaders[0]! : null,
      tied: leaders.length > 1, evidenceIds: [...new Set(votes.map((vote) => vote.evidenceId))],
    };
  }

  async getMemberActivity(query: GetMemberActivityQuery): Promise<GetMemberActivityResult> {
    const asOf = new Date();
    const memberAddress = query.memberAddress.trim().toLowerCase();
    const proposal = await this.resolveProposal(query.proposalId, query.daoId);
    const base = {
      chainId: this.proposals.getChainId(), contractAddress: this.proposals.getContractAddress(),
      asOf: asOf.toISOString(), daoId: query.daoId, memberAddress,
    };
    if (!proposal) return {
      ...base, found: false, proposalId: query.proposalId, onChainProposalId: null,
      assignment: null, votes: [], hasVoted: false, evidenceIds: [],
    };
    const [assignment, rawVotes] = await Promise.all([
      this.assignments.findDetailed(proposal.id, memberAddress),
      this.votes.listDetailed(proposal.id),
    ]);
    const options = new Map(proposal.options.map((option) => [option.index, option.label]));
    const votes = rawVotes.filter((vote) => vote.voterAddress === memberAddress)
      .map((vote) => ({ ...vote, optionLabel: options.get(vote.optionIndex) ?? null }));
    const evidenceIds = [...new Set([
      ...(assignment?.evidenceId ? [assignment.evidenceId] : []),
      ...votes.map((vote) => vote.evidenceId),
    ])];
    return {
      ...base, found: true, proposalId: proposal.id, onChainProposalId: proposal.onChainId,
      assignment: assignment ? {
        assigned: assignment.assigned, votingWeight: assignment.votingWeight, transactionHash: assignment.transactionHash,
        evidenceId: assignment.evidenceId, effectiveFrom: assignment.assignedAt.toISOString(),
      } : null,
      votes, hasVoted: votes.length > 0, evidenceIds,
    };
  }

  async resolveProposal(proposalId: string, daoId: string | null) {
    let proposal = await this.proposals.findById(proposalId);
    if (!proposal && /^\d+$/.test(proposalId)) proposal = await this.proposals.findByOnChainId(proposalId);
    if (proposal && daoId !== null && proposal.daoId !== daoId) return null;
    return proposal;
  }

  async getProposalTransactions(
    query: {
      proposalId: string;
      operation: string | null;
      limit: number;
      offset: number;
    },
    daoId?: string,
  ): Promise<{
    proposalId: string;
    onChainProposalId: string | null;
    count: number;
    transactions: Array<{
      hash: string;
      sender: string;
      blockNumber: string;
      blockHash: string;
      transactionIndex: number | null;
      status: string;
      gasUsed: string;
      operation: string;
      createdAt: string;
    }>;
    asOf: string;
    chainId: string;
    contractAddress: string;
    daoId: string | null;
    evidenceIds: string[];
  }> {
    const asOf = new Date();
    // Resolve proposal by local ID or on-chain ID
    let proposal = await this.proposals.findById(query.proposalId);
    if (!proposal && /^\d+$/.test(query.proposalId)) {
      proposal = await this.proposals.findByOnChainId(query.proposalId);
    }
    if (!proposal) {
      return {
        proposalId: query.proposalId,
        onChainProposalId: null,
        count: 0,
        transactions: [],
        asOf: asOf.toISOString(),
        chainId: this.proposals.getChainId(),
        contractAddress: this.proposals.getContractAddress(),
        daoId: daoId ?? null,
        evidenceIds: [],
      };
    }
    // Verify DAO scope if provided
    if (daoId !== undefined && daoId !== null && proposal.daoId !== daoId) {
      return {
        proposalId: proposal.id,
        onChainProposalId: proposal.onChainId,
        count: 0,
        transactions: [],
        asOf: asOf.toISOString(),
        chainId: this.proposals.getChainId(),
        contractAddress: this.proposals.getContractAddress(),
        daoId: daoId ?? null,
        evidenceIds: [],
      };
    }
    // Get transactions
    const allTransactions = await this.transactions.listForProposalDetailed(proposal.id);
    const filtered = query.operation
      ? allTransactions.filter((t) => t.operation === query.operation)
      : allTransactions;
    // Sort deterministically: block number desc, transaction index asc, hash asc
    const sorted = [...filtered].sort((a, b) => {
      const blockNumA = parseInt(a.blockNumber, 10);
      const blockNumB = parseInt(b.blockNumber, 10);
      if (blockNumA !== blockNumB) return blockNumB - blockNumA;
      if (a.transactionIndex !== null && b.transactionIndex !== null && a.transactionIndex !== b.transactionIndex) {
        return a.transactionIndex - b.transactionIndex;
      }
      if (a.transactionIndex !== null) return -1;
      if (b.transactionIndex !== null) return 1;
      return a.transactionHash.localeCompare(b.transactionHash);
    });
    const paginated = sorted.slice(query.offset, query.offset + query.limit);
    const timeline = await this.getProposalTimeline({ proposalId: proposal.id, daoId: proposal.daoId });
    const evidenceByHash = new Map(timeline.events.map((event) => [event.transactionHash, event.evidenceId]));
    return {
      proposalId: proposal.id,
      onChainProposalId: proposal.onChainId,
      count: filtered.length,
      transactions: paginated.map((t) => ({
        hash: t.transactionHash,
        sender: t.sender,
        blockNumber: t.blockNumber,
        blockHash: t.blockHash,
        transactionIndex: t.transactionIndex,
        status: t.status,
        gasUsed: t.gasUsed,
        operation: t.operation,
        createdAt: t.recordedAt.toISOString(),
      })),
      asOf: asOf.toISOString(),
      chainId: this.proposals.getChainId(),
      contractAddress: this.proposals.getContractAddress(),
      daoId: proposal.daoId,
      evidenceIds: paginated.flatMap((transaction) => {
        const evidenceId = evidenceByHash.get(transaction.transactionHash);
        return evidenceId ? [evidenceId] : [];
      }),
    };
  }

  async getProposalTimeline(query: { proposalId: string; daoId: string | null }): Promise<ProposalTimelineResult> {
    const asOf = new Date();
    const proposal = await this.resolveProposal(query.proposalId, query.daoId);
    const base = {
      asOf: asOf.toISOString(), chainId: this.proposals.getChainId(),
      contractAddress: this.proposals.getContractAddress(), daoId: query.daoId,
    };
    if (!proposal) return { ...base, found: false, proposalId: query.proposalId, onChainProposalId: null, events: [], evidenceIds: [] };
    if (!proposal.onChainId) return { ...base, found: true, proposalId: proposal.id, onChainProposalId: null, events: [], evidenceIds: [] };
    const events = await this.governanceEvents.listGovernanceEvents({
      chainId: this.proposals.getChainId(), contractAddress: this.proposals.getContractAddress(),
      proposalId: proposal.onChainId, canonical: true, limit: Number.MAX_SAFE_INTEGER, offset: 0,
    });
    const mapped = events.map(mapGovernanceEvent);
    return { ...base, found: true, proposalId: proposal.id, onChainProposalId: proposal.onChainId, events: mapped, evidenceIds: mapped.map((event) => event.evidenceId) };
  }

  async getProposalEvidence(query: { proposalId: string; daoId: string | null }): Promise<ProposalEvidenceResult> {
    const asOf = new Date();
    const proposal = await this.resolveProposal(query.proposalId, query.daoId);
    const base = { asOf: asOf.toISOString(), chainId: this.proposals.getChainId(), contractAddress: this.proposals.getContractAddress(), daoId: query.daoId };
    if (!proposal) return { ...base, found: false, proposalId: query.proposalId, onChainProposalId: null, evidenceIds: [] };
    const timeline = await this.getProposalTimeline({ proposalId: proposal.id, daoId: proposal.daoId });
    const artefacts = await this.database.executor
      .selectFrom('proposal_artefacts')
      .select('evidence_id')
      .where('proposal_id', '=', proposal.id)
      .orderBy('evidence_id')
      .execute();
    const evidenceIds = [...new Set([...timeline.evidenceIds, ...artefacts.map((row) => row.evidence_id)])];
    return { ...base, found: true, proposalId: proposal.id, onChainProposalId: proposal.onChainId, evidenceIds };
  }

  async getEvidenceById(evidenceId: string, datasetVersion?: string): Promise<EvidenceLookupResult> {
    const event = await this.governanceEvents.findGovernanceEventByEvidenceId(evidenceId);
    if (event) {
      const result = validateGovernanceEvent(event, this.proposals.getChainId(), this.proposals.getContractAddress());
      if (datasetVersion) {
        const row = await this.database.executor.selectFrom('governance_events').select('dataset_version_id').where('evidence_id', '=', evidenceId).executeTakeFirst();
        if (!row || String(row.dataset_version_id) !== datasetVersion) {
          result.valid = false;
          result.warnings.push('Dataset scope mismatch.');
        }
      }
      return result;
    }
    const artefact = await this.database.executor.selectFrom('artefacts').selectAll().where('evidence_id', '=', evidenceId).executeTakeFirst();
    if (artefact) {
      const edges = await this.database.executor.selectFrom('provenance_edges').selectAll().where((eb) => eb.or([eb('from_evidence_id', '=', evidenceId), eb('to_evidence_id', '=', evidenceId)])).execute();
      const warnings: string[] = [];
      if (artefact.verification_status !== 'VERIFIED') warnings.push('Artefact is not verified.');
      if (artefact.lifecycle_state !== 'LINKED') warnings.push('Artefact is not linked to a proposal.');
      if (datasetVersion && String(artefact.dataset_version_id) !== datasetVersion) warnings.push('Dataset scope mismatch.');
      return { evidenceId, valid: warnings.length === 0, sourceType: 'artefact', proposalId: artefact.proposal_id, lineage: { uri: artefact.uri, hashAlgorithm: artefact.hash_algorithm, expectedHash: artefact.expected_hash, computedHash: artefact.computed_hash, verificationStatus: artefact.verification_status, lifecycleState: artefact.lifecycle_state }, relatedEvidence: edges.flatMap((edge) => [edge.from_evidence_id, edge.to_evidence_id]).filter((id) => id !== evidenceId), warnings };
    }
    const chunk = await this.database.executor.selectFrom('document_chunks').innerJoin('artefacts', 'artefacts.id', 'document_chunks.artefact_id').select(['document_chunks.proposal_id', 'document_chunks.artefact_id', 'document_chunks.chunk_index', 'artefacts.evidence_id as artefactEvidenceId', 'artefacts.verification_status', 'artefacts.lifecycle_state', 'artefacts.dataset_version_id']).where('document_chunks.evidence_id', '=', evidenceId).executeTakeFirst();
    if (chunk) {
      const warnings: string[] = [];
      if (chunk.verification_status !== 'VERIFIED') warnings.push('Parent artefact is not verified.');
      if (chunk.lifecycle_state !== 'LINKED') warnings.push('Parent artefact is not linked.');
      if (datasetVersion && String(chunk.dataset_version_id) !== datasetVersion) warnings.push('Dataset scope mismatch.');
      return { evidenceId, valid: warnings.length === 0, sourceType: 'document-chunk', proposalId: chunk.proposal_id, lineage: { artefactId: chunk.artefact_id, chunkIndex: chunk.chunk_index }, relatedEvidence: [chunk.artefactEvidenceId], warnings };
    }
    return { evidenceId, valid: false, sourceType: 'unknown', proposalId: null, lineage: null, relatedEvidence: [], warnings: ['Evidence does not exist.'] };
  }

  getContractDeployment(): Promise<GetContractDeploymentResult> {
    return this.proposals.getContractDeployment();
  }

  async getIndexerStatus(query: GetIndexerStatusQuery): Promise<GetIndexerStatusResult> {
    const asOf = new Date();
    const chainId = this.proposals.getChainId();
    const contractAddress = this.proposals.getContractAddress();
    const indexerName = query.indexerName;
    const indexerVersion = '1'; // default version from sync state repository

    const { PostgresSyncStateRepository } = await import('@dao-platform/database');
    const syncState = new PostgresSyncStateRepository(
      this.database,
      chainId,
      contractAddress,
      indexerVersion,
    );

    const processedBlockNumber = await syncState.getLastProcessedBlock(indexerName);

    if (processedBlockNumber === null) {
      return {
        found: false,
        chainId,
        contractAddress,
        indexerName,
        indexerVersion,
        processedBlockNumber: null,
        processedBlockHash: null,
        checkpointTimestamp: null,
        observedAt: asOf.toISOString(),
        freshness: 'UNKNOWN',
        evidenceIds: [],
      };
    }

    // Get full checkpoint details
    const row = await this.database.executor
      .selectFrom('indexer_checkpoints')
      .selectAll()
      .where('chain_id', '=', chainId)
      .where('contract_address', '=', contractAddress)
      .where('indexer_name', '=', indexerName)
      .where('indexer_version', '=', indexerVersion)
      .executeTakeFirst();

    if (!row) {
      return {
        found: false,
        chainId,
        contractAddress,
        indexerName,
        indexerVersion,
        processedBlockNumber: processedBlockNumber.toString(),
        processedBlockHash: null,
        checkpointTimestamp: null,
        observedAt: asOf.toISOString(),
        freshness: 'UNKNOWN',
        evidenceIds: [],
      };
    }

    const evidenceId = `indexer:${chainId}:${contractAddress}:${indexerName}:${indexerVersion}`;
    
    // Freshness is UNKNOWN since we don't have a trusted chain-head comparison
    const freshness: 'FRESH' | 'STALE' | 'UNKNOWN' = 'UNKNOWN';

    return {
      found: true,
      chainId,
      contractAddress,
      indexerName,
      indexerVersion,
      processedBlockNumber: row.processed_block_number.toString(),
      processedBlockHash: row.processed_block_hash ?? null,
      checkpointTimestamp: row.updated_at.toISOString(),
      observedAt: asOf.toISOString(),
      freshness,
      evidenceIds: [evidenceId],
    };
  }

  async resolveDeploymentEvidence(evidenceId: string) {
    const deployment = await this.proposals.getContractDeployment();
    const expectedId = `deployment:${deployment.chainId}:${deployment.contractAddress}`;
    const valid = deployment.found && evidenceId === expectedId;
    return {
      evidenceId,
      valid,
      sourceType: valid ? 'contract-deployment' : 'unknown',
      proposalId: null,
      lineage: valid
        ? {
            chainId: deployment.chainId,
            contractAddress: deployment.contractAddress,
            transactionHash: deployment.deploymentTransaction,
            blockNumber: deployment.deploymentBlockNumber,
            blockHash: deployment.deploymentBlockHash,
          }
        : null,
      relatedEvidence: [],
      warnings: valid
        ? []
        : ['Deployment evidence does not exist in the configured deployment.'],
    };
  }

  async resolveEvidence(evidenceId: string) {
    const proposal = await this.proposals.findStructuredEvidence(
      evidenceId.slice('structured:proposal:'.length),
    );
    return {
      evidenceId,
      valid: Boolean(proposal),
      sourceType: 'structured',
      proposalId: proposal?.id ?? null,
      lineage: proposal
        ? {
            chainId: proposal.chain_id,
            contractAddress: proposal.contract_address,
            updatedAt: proposal.updated_at,
          }
        : null,
      relatedEvidence: proposal?.creation_evidence_id
        ? [proposal.creation_evidence_id]
        : [],
      warnings: proposal
        ? [
            'Operational database evidence; not an immutable on-chain proof or a historical query snapshot.',
          ]
        : ['Proposal evidence does not exist in the configured deployment.'],
    };
  }
}

function eventEvidenceId(event: Pick<StoredGovernanceEvent, 'chainId' | 'contractAddress' | 'transactionHash' | 'logIndex'>) {
  return `event:${event.chainId}:${event.contractAddress}:${event.transactionHash}:${event.logIndex}`;
}

function mapGovernanceEvent(event: StoredGovernanceEvent): ProposalTimelineResult['events'][number] {
  return {
    evidenceId: eventEvidenceId(event),
    eventName: event.eventName,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    blockTimestamp: event.blockTimestamp,
    transactionSender: event.transactionSender,
    eventArgs: event.eventArgs,
  };
}

function validateGovernanceEvent(
  event: StoredGovernanceEvent,
  chainId: string,
  contractAddress: string,
  _datasetVersion?: string,
): EvidenceLookupResult {
  const expectedId = eventEvidenceId(event);
  const warnings: string[] = [];
  if (event.evidenceId !== expectedId) warnings.push('Evidence ID does not match the canonical event identity.');
  if (event.chainId !== chainId || event.contractAddress !== contractAddress) warnings.push('Event is outside the configured governance deployment.');
  if (!event.canonical) warnings.push('Event is not canonical.');
  return {
    evidenceId: event.evidenceId,
    valid: warnings.length === 0,
    sourceType: 'governance-event',
    proposalId: typeof event.eventArgs.proposalId === 'string' ? event.eventArgs.proposalId : null,
    lineage: { chainId: event.chainId, contractAddress: event.contractAddress, transactionHash: event.transactionHash, blockNumber: event.blockNumber, blockHash: event.blockHash, transactionIndex: event.transactionIndex, logIndex: event.logIndex },
    relatedEvidence: [],
    warnings,
  };
}
