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
