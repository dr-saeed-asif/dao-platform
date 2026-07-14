import { ProposalStatus, ProposalType } from "@dao-platform/domain";
import { PreparedTransaction } from "../../ports/governance-chain.gateway.js";

export interface ProposalView {
  readonly id: string;
  readonly daoId: string;
  readonly creatorAddress: string;
  readonly title: string;
  readonly purpose: string;
  readonly description: string;
  readonly type: ProposalType;
  readonly status: ProposalStatus;
  readonly options: ReadonlyArray<{
    readonly index: number;
    readonly label: string;
  }>;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly createdAt: string;
}

export interface CreateProposalResult {
  readonly proposal: ProposalView;
  readonly transaction: PreparedTransaction;
}
