import { DomainRuleError } from "../shared/domain-rule.error.js";
import { WalletAddress } from "../shared/wallet-address.js";
import {
  ProposalMetadata,
  ProposalOption,
  ProposalStatus,
  ProposalType,
} from "./proposal.types.js";

export interface CreateProposalInput {
  readonly id: string;
  readonly daoId: string;
  readonly creatorAddress: string;
  readonly title: string;
  readonly purpose: string;
  readonly description: string;
  readonly type: ProposalType;
  readonly optionLabels: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly metadata?: ProposalMetadata;
  readonly now?: Date;
}

export interface RehydrateProposalInput extends CreateProposalInput {
  readonly status: ProposalStatus;
  readonly onChainId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Proposal {
  private constructor(
    public readonly id: string,
    public readonly daoId: string,
    public readonly creatorAddress: WalletAddress,
    public readonly title: string,
    public readonly purpose: string,
    public readonly description: string,
    public readonly type: ProposalType,
    public readonly options: readonly ProposalOption[],
    public readonly startsAt: Date,
    public readonly endsAt: Date,
    public readonly metadata: ProposalMetadata,
    public readonly status: ProposalStatus,
    public readonly onChainId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(input: CreateProposalInput): Proposal {
    const now = input.now ?? new Date();

    return Proposal.build({
      ...input,
      status: ProposalStatus.Draft,
      onChainId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(input: RehydrateProposalInput): Proposal {
    return Proposal.build(input);
  }

  private static build(input: RehydrateProposalInput): Proposal {
    const id = requiredText(input.id, "id", 100);
    const daoId = requiredText(input.daoId, "daoId", 100);
    const title = boundedText(input.title, "title", 3, 200);
    const purpose = boundedText(input.purpose, "purpose", 3, 500);
    const description = boundedText(
      input.description,
      "description",
      10,
      10_000,
    );
    const options = createOptions(input.optionLabels);
    const startsAt = validDate(input.startsAt, "startsAt");
    const endsAt = validDate(input.endsAt, "endsAt");
    const createdAt = validDate(input.createdAt, "createdAt");
    const updatedAt = validDate(input.updatedAt, "updatedAt");

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new DomainRuleError(
        "INVALID_VOTING_PERIOD",
        "Proposal end time must be later than its start time.",
      );
    }

    if (updatedAt.getTime() < createdAt.getTime()) {
      throw new DomainRuleError(
        "INVALID_AUDIT_TIMESTAMPS",
        "Proposal updatedAt cannot be earlier than createdAt.",
      );
    }

    const statusesRequiringOnChainId = new Set([
      ProposalStatus.Active,
      ProposalStatus.Closed,
      ProposalStatus.Executed,
      ProposalStatus.Failed,
    ]);

    if (statusesRequiringOnChainId.has(input.status) && !input.onChainId) {
      throw new DomainRuleError(
        "MISSING_ON_CHAIN_ID",
        "An on-chain proposal status requires an on-chain identifier.",
      );
    }

    return new Proposal(
      id,
      daoId,
      WalletAddress.create(input.creatorAddress),
      title,
      purpose,
      description,
      input.type,
      options,
      startsAt,
      endsAt,
      Object.freeze({ ...(input.metadata ?? {}) }),
      input.status,
      input.onChainId,
      createdAt,
      updatedAt,
    );
  }
}

function requiredText(value: string, field: string, max: number): string {
  return boundedText(value, field, 1, max);
}

function boundedText(
  value: string,
  field: string,
  min: number,
  max: number,
): string {
  const normalized = value.trim();

  if (normalized.length < min || normalized.length > max) {
    throw new DomainRuleError(
      "INVALID_PROPOSAL_FIELD",
      `${field} must contain between ${min} and ${max} characters.`,
    );
  }

  return normalized;
}

function createOptions(labels: readonly string[]): readonly ProposalOption[] {
  if (labels.length < 2 || labels.length > 10) {
    throw new DomainRuleError(
      "INVALID_VOTING_OPTIONS",
      "A proposal must contain between 2 and 10 voting options.",
    );
  }

  const normalizedLabels = labels.map((label) =>
    boundedText(label, "option label", 1, 100),
  );
  const uniqueLabels = new Set(
    normalizedLabels.map((label) => label.toLocaleLowerCase("en-US")),
  );

  if (uniqueLabels.size !== normalizedLabels.length) {
    throw new DomainRuleError(
      "DUPLICATE_VOTING_OPTION",
      "Voting option labels must be unique.",
    );
  }

  return Object.freeze(
    normalizedLabels.map((label, index) => Object.freeze({ index, label })),
  );
}

function validDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainRuleError("INVALID_DATE", `${field} must be a valid date.`);
  }

  return new Date(value.getTime());
}
