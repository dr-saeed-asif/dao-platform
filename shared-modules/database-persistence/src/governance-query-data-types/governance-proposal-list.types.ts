export type ProposalListStatus =
  "ACTIVE" | "UPCOMING" | "ENDED" | "CANCELLED" | "FINALIZED";

export interface ProposalListQuery {
  status: ProposalListStatus | null;
  /** Inclusive bounds on the scheduled voting start, not creation time. */
  from: string | null;
  to: string | null;
  limit: number;
  offset: number;
}

export interface ProposalListItem {
  proposalId: string;
  onChainProposalId: string | null;
  title: string;
  creator: string;
  status: ProposalListStatus;
  startsAt: string;
  endsAt: string;
  memberCount: number;
  voteCount: number;
}

export interface ProposalListResult {
  count: number;
  proposals: ProposalListItem[];
  query: ProposalListQuery & {
    asOf: string;
    chainId: string;
    contractAddress: string;
    daoId: string | null;
  };
}
