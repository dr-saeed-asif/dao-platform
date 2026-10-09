export interface GetProposalDetailsQuery {
  proposalId: string;
  daoId: string | null;
}

export interface GetProposalDetailsResult {
  found: boolean;
  proposalId: string;
  onChainProposalId: string | null;
  daoId: string | null;
  chainId: string;
  contractAddress: string;
  title: string | null;
  purpose: string | null;
  description: string | null;
  creator: string | null;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
  options: Array<{ optionIndex: number; label: string }>;
  memberCount: number;
  voteCount: number;
  creationEvidenceId: string | null;
  asOf: string;
  evidenceIds: string[];
}

