export enum ProposalType {
  Standard = "STANDARD",
  Treasury = "TREASURY",
  ParameterChange = "PARAMETER_CHANGE",
  Membership = "MEMBERSHIP",
  Other = "OTHER",
}

export enum ProposalStatus {
  Draft = "DRAFT",
  PendingOnChain = "PENDING_ON_CHAIN",
  Active = "ACTIVE",
  Closed = "CLOSED",
  Cancelled = "CANCELLED",
  Executed = "EXECUTED",
  Failed = "FAILED",
}

export interface ProposalOption {
  readonly index: number;
  readonly label: string;
}

export type ProposalMetadata = Readonly<Record<string, unknown>>;
