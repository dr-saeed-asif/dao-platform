import { ProposalType } from "@dao-platform/domain";

export class ChainTransactionRevertedError extends Error {
  constructor() {
    super("Blockchain transaction reverted.");
    this.name = "ChainTransactionRevertedError";
  }
}

export interface PrepareCreateProposalRequest {
  readonly localProposalId: string;
  readonly daoId: string;
  readonly creatorAddress: string;
  readonly title: string;
  readonly purpose: string;
  readonly description: string;
  readonly type: ProposalType;
  readonly optionLabels: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PreparedTransaction {
  readonly chainId: string;
  readonly from: string;
  readonly to: string;
  readonly data: string;
  readonly value: string;
  readonly gasLimit?: string;
}

export interface GovernanceChainGateway {
  prepareCreateProposal(
    request: PrepareCreateProposalRequest,
  ): Promise<PreparedTransaction>;
  publishProposal(
    request: PrepareCreateProposalRequest,
  ): Promise<PublishedProposalTransaction>;
  assignMembers(
    proposalId: string,
    members: readonly string[],
  ): Promise<ConfirmedChainTransaction>;
  unassignMember(
    proposalId: string,
    member: string,
  ): Promise<ConfirmedChainTransaction>;
  prepareVote(
    proposalId: string,
    voterAddress: string,
    optionIndex: number,
  ): Promise<PreparedTransaction>;
  getConfirmedVote(transactionHash: string): Promise<ConfirmedVote | null>;
  findConfirmedVotes(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<readonly ConfirmedVote[]>;
  findGovernanceEvents(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<readonly GovernanceChainEvent[]>;
  latestBlockNumber(): Promise<bigint>;
  cancelProposal(proposalId: string): Promise<ConfirmedChainTransaction>;
  finalizeProposal(proposalId: string): Promise<ConfirmedFinalization>;
}

export type GovernanceChainEvent =
  | (GovernanceEventBase & { readonly kind: "PROPOSAL_CREATED"; readonly onChainProposalId: string; readonly creatorAddress: string; readonly proposalType: number; readonly metadataHash: string; readonly metadataURI: string; readonly optionCount: number; readonly startsAt: number; readonly endsAt: number })
  | (GovernanceEventBase & { readonly kind: "MEMBER_ASSIGNED" | "MEMBER_UNASSIGNED"; readonly onChainProposalId: string; readonly memberAddress: string })
  | (GovernanceEventBase & { readonly kind: "VOTE_CAST"; readonly onChainProposalId: string; readonly voterAddress: string; readonly optionIndex: number })
  | (GovernanceEventBase & { readonly kind: "PROPOSAL_CANCELLED"; readonly onChainProposalId: string })
  | (GovernanceEventBase & { readonly kind: "PROPOSAL_FINALIZED"; readonly onChainProposalId: string; readonly winningOption: number; readonly tied: boolean; readonly totalVotes: number });

export interface GovernanceEventBase extends ConfirmedChainTransaction {
  readonly logIndex: number;
}

export interface ConfirmedVote extends ConfirmedChainTransaction {
  readonly onChainProposalId: string;
  readonly voterAddress: string;
  readonly optionIndex: number;
}

export interface ConfirmedFinalization extends ConfirmedChainTransaction {
  readonly winningOption: number;
  readonly tied: boolean;
  readonly totalVotes: number;
}

export interface ConfirmedChainTransaction {
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly gasUsed: string;
  readonly status: "CONFIRMED";
}

export interface PublishedProposalTransaction extends ConfirmedChainTransaction {
  readonly onChainProposalId: string;
}
