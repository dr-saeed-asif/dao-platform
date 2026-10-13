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

