import { isDeepStrictEqual } from "node:util";
import { Proposal } from "@dao-platform/domain";
import { Clock } from "../../dependency-interfaces/current-time.interface.js";
import { GovernanceChainGateway } from "../../dependency-interfaces/governance-blockchain-gateway.interface.js";
import { IdGenerator } from "../../dependency-interfaces/unique-identifier-generator.interface.js";
import { ProposalAuthorization } from "../../dependency-interfaces/governance-proposal-authorization.interface.js";
import { ProposalRepository } from "../../dependency-interfaces/governance-proposal-repository.interface.js";
import { TransactionManager } from "../../dependency-interfaces/database-transaction-manager.interface.js";
import { ApplicationError } from "../../use-case-errors/governance-use-case.error.js";
import { CreateProposalCommand } from "./create-governance-proposal.command.js";
import { CreateProposalResult } from "./create-governance-proposal.result.js";
import { toProposalView } from "../governance-proposal.view.js";

export interface CreateProposalDependencies {
  readonly proposals: ProposalRepository;
  readonly authorization: ProposalAuthorization;
  readonly chainGateway: GovernanceChainGateway;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class CreateProposalUseCase {
  constructor(private readonly dependencies: CreateProposalDependencies) {}

  async execute(command: CreateProposalCommand): Promise<CreateProposalResult> {
    const idempotencyKey = command.idempotencyKey.trim();

    if (!idempotencyKey) {
      throw new ApplicationError(
        "MISSING_IDEMPOTENCY_KEY",
        "An idempotency key is required to create a proposal.",
      );
    }

    await this.dependencies.authorization.assertCanCreateProposal({
      actorAddress: command.actorAddress,
      daoId: command.daoId,
    });

    const proposal =
      await this.dependencies.transactionManager.runInTransaction(async () => {
        const existing =
          await this.dependencies.proposals.findByIdempotencyKey(
            idempotencyKey,
          );

        if (existing) {
          assertSameRequest(existing, command);
          return existing;
        }

        const created = Proposal.create({
          id: this.dependencies.idGenerator.next(),
          daoId: command.daoId,
          creatorAddress: command.actorAddress,
          title: command.title,
          purpose: command.purpose,
          description: command.description,
          type: command.type,
          optionLabels: command.optionLabels,
          startsAt: command.startsAt,
          endsAt: command.endsAt,
          ...(command.metadata ? { metadata: command.metadata } : {}),
          now: this.dependencies.clock.now(),
        });

        await this.dependencies.proposals.insert(created, { idempotencyKey });
        return created;
      });

    const transaction =
      await this.dependencies.chainGateway.prepareCreateProposal({
        localProposalId: proposal.id,
        daoId: proposal.daoId,
        creatorAddress: proposal.creatorAddress.value,
        title: proposal.title,
        purpose: proposal.purpose,
        description: proposal.description,
        type: proposal.type,
        optionLabels: proposal.options.map((option) => option.label),
        startsAt: proposal.startsAt,
        endsAt: proposal.endsAt,
        metadata: proposal.metadata,
      });

    return { proposal: toProposalView(proposal), transaction };
  }
}

function assertSameRequest(
  proposal: Proposal,
  command: CreateProposalCommand,
): void {
  const sameRequest =
    proposal.daoId === command.daoId.trim() &&
    proposal.creatorAddress.value ===
      command.actorAddress.trim().toLowerCase() &&
    proposal.title === command.title.trim() &&
    proposal.purpose === command.purpose.trim() &&
    proposal.description === command.description.trim() &&
    proposal.type === command.type &&
    proposal.startsAt.getTime() === command.startsAt.getTime() &&
    proposal.endsAt.getTime() === command.endsAt.getTime() &&
    isDeepStrictEqual(proposal.metadata, command.metadata ?? {}) &&
    proposal.options.map((option) => option.label).join("\u0000") ===
      command.optionLabels.map((option) => option.trim()).join("\u0000");

  if (!sameRequest) {
    throw new ApplicationError(
      "IDEMPOTENCY_KEY_CONFLICT",
      "The idempotency key was already used for a different proposal request.",
    );
  }
}
