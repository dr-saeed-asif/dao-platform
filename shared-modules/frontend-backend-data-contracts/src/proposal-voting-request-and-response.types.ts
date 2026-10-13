export interface PreparedTransaction {
  chainId: string;
  from: string;
  to: string;
  data: string;
  value: string;
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
