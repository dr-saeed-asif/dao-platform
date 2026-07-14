export interface VoteRecord {
  readonly proposalId: string;
  readonly onChainProposalId: string;
  readonly voterAddress: string;
  readonly optionIndex: number;
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly gasUsed: string;
  readonly confirmedAt: Date;
}

export interface VoteRepository {
  findByProposalAndVoter(
    proposalId: string,
    voterAddress: string,
  ): Promise<VoteRecord | null>;
  upsert(vote: VoteRecord): Promise<void>;
  list(proposalId: string): Promise<readonly VoteRecord[]>;
}
