export interface ProposalOption {
  index: number;
  label: string;
}
export interface Proposal {
  id: string;
  daoId: string;
  onChainId: string | null;
  creatorAddress: string;
  title: string;
  purpose: string;
  description: string;
  type: string;
  status: string;
  options: ProposalOption[];
  startsAt: string;
  endsAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface PreparedTransaction {
  chainId: string;
  from: string;
  to: string;
  data: string;
  value: string;
}
export interface CreateProposalInput {
  daoId: string;
  title: string;
  purpose: string;
  description: string;
  type: string;
  optionLabels: string[];
  startsAt: string;
  endsAt: string;
  metadataURI: string;
  metadataHash: string;
}
export interface Assignment {
  proposalId: string;
  walletAddress: string;
  transactionHash: string;
  assignedAt: string;
}
export interface Vote {
  proposalId: string;
  onChainProposalId: string;
  voterAddress: string;
  optionIndex: number;
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  gasUsed: string;
  confirmedAt: string;
}
export interface ChainTransaction {
  transactionHash: string;
  operation:
    | "CREATE_PROPOSAL"
    | "ASSIGN_MEMBERS"
    | "UNASSIGN_MEMBER"
    | "CAST_VOTE"
    | "CANCEL_PROPOSAL"
    | "FINALIZE_PROPOSAL";
  proposalId: string;
  walletAddress: string;
  blockNumber: string;
  blockHash: string;
  gasUsed: string;
  status: "CONFIRMED";
  recordedAt: string;
}
