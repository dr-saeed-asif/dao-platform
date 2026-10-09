import type { ProposalVoteDetail } from './proposal-votes.types.js';

export interface GetMemberActivityQuery {
  proposalId: string;
  memberAddress: string;
  daoId: string | null;
}

export interface GetMemberActivityResult {
  found: boolean;
  proposalId: string;
  onChainProposalId: string | null;
  memberAddress: string;
  assignment: {
    assigned: boolean;
    votingWeight: number;
    transactionHash: string | null;
    evidenceId: string | null;
    effectiveFrom: string | null;
  } | null;
  votes: ProposalVoteDetail[];
  hasVoted: boolean;
  asOf: string;
  chainId: string;
  contractAddress: string;
  daoId: string | null;
  evidenceIds: string[];
}

