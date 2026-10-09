export interface GetProposalMembersQuery {
  proposalId: string;
  daoId: string | null;
}

export interface GetProposalMembersResult {
  found: boolean;
  proposalId: string;
  onChainProposalId: string | null;
  count: number;
  totalVotingPower: number;
  members: Array<{
    address: string;
    votingPower: number;
  }>;
  asOf: string;
  chainId: string;
  contractAddress: string;
  daoId: string | null;
  evidenceIds: string[];
}
