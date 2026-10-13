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
