import { ProposalType } from "@dao-platform/domain";

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
