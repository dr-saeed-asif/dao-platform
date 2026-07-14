export interface ProposalAssignmentRecord {
  readonly proposalId: string;
  readonly walletAddress: string;
  readonly transactionHash: string;
  readonly assignedAt: Date;
}

export interface AssignmentRepository {
  addMany(records: readonly ProposalAssignmentRecord[]): Promise<void>;
  remove(proposalId: string, walletAddress: string): Promise<void>;
  list(proposalId: string): Promise<readonly ProposalAssignmentRecord[]>;
}
