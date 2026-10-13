export interface GetProposalVotesQuery {
  proposalId: string;
  daoId: string | null;
}

export interface ProposalVoteDetail {
  voterAddress: string;
  transactionSender: string | null;
  optionIndex: number;
  optionLabel: string | null;
  votingPower: number;
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: string;
  gasUsed: string | null;
  confirmedAt: string;
  evidenceId: string;
}

export interface ProposalVoteOptionTotal {
  optionIndex: number;
  optionLabel: string | null;
  voteCount: number;
  totalVotingPower: number;
}

export interface GetProposalVotesResult {
  found: boolean;
  proposalId: string;
  onChainProposalId: string | null;
  count: number;
  totalVotingPower: number;
  votes: ProposalVoteDetail[];
  optionTotals: ProposalVoteOptionTotal[];
  winningOption: ProposalVoteOptionTotal | null;
  tied: boolean;
  asOf: string;
  chainId: string;
  contractAddress: string;
  daoId: string | null;
  evidenceIds: string[];
}

