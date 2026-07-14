import { Proposal, ProposalStatus, ProposalType } from "@dao-platform/domain";

export interface ProposalView {
  readonly id: string;
  readonly daoId: string;
  readonly onChainId: string | null;
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
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toProposalView(proposal: Proposal): ProposalView {
  return {
    id: proposal.id,
    daoId: proposal.daoId,
    onChainId: proposal.onChainId,
    creatorAddress: proposal.creatorAddress.value,
    title: proposal.title,
    purpose: proposal.purpose,
    description: proposal.description,
    type: proposal.type,
    status: proposal.status,
    options: proposal.options.map((option) => ({ ...option })),
    startsAt: proposal.startsAt.toISOString(),
    endsAt: proposal.endsAt.toISOString(),
    metadata: proposal.metadata,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}
