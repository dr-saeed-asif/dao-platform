import { ProposalMetadata, ProposalType } from "@dao-platform/domain";

export interface CreateProposalCommand {
  readonly idempotencyKey: string;
  readonly actorAddress: string;
  readonly daoId: string;
  readonly title: string;
  readonly purpose: string;
  readonly description: string;
  readonly type: ProposalType;
  readonly optionLabels: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly metadata?: ProposalMetadata;
}
