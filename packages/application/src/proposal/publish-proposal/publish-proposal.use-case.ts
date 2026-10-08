import { ProposalStatus } from "@dao-platform/domain";
import { Clock } from "../../ports/clock.js";
import { ChainTransactionRepository } from "../../ports/chain-transaction-repository.js";
import {
  ChainEventNotFoundError,
  ChainTransactionRevertedError,
  GovernanceChainGateway,
} from "../../ports/governance-chain.gateway.js";
import { ProposalAuthorization } from "../../ports/proposal-authorization.js";
import { ProposalRepository } from "../../ports/proposal-repository.js";
import { TransactionManager } from "../../ports/transaction-manager.js";
import { ApplicationError } from "../../shared/application.error.js";

export class PublishProposalUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly transactions: ChainTransactionRepository,
    private readonly authorization: ProposalAuthorization,
    private readonly chain: GovernanceChainGateway,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(proposalId: string, actorAddress: string) {
    const proposal = await this.proposals.findById(proposalId);
    if (!proposal) {
      throw new ApplicationError("PROPOSAL_NOT_FOUND", "Proposal not found.");
    }
    await this.authorization.assertCanCreateProposal({
      actorAddress,
      daoId: proposal.daoId,
    });
    if (proposal.onChainId) {
      throw new ApplicationError(
        "PROPOSAL_ALREADY_PUBLISHED",
        "Proposal is already published on-chain.",
      );
    }
    const validationTime = this.clock.now();
    if (proposal.startsAt.getTime() <= validationTime.getTime()) {
      throw new ApplicationError(
        "INVALID_VOTING_PERIOD",
        `Publishing must complete before voting opens. Voting opened at ${proposal.startsAt.toISOString()} UTC; current server time is ${validationTime.toISOString()} UTC. Create a replacement proposal with a future start time.`,
      );
    }

    let result;
    try {
      result = await this.chain.publishProposal({
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
    } catch (error) {
      if (error instanceof ChainTransactionRevertedError) {
        throw new ApplicationError(
          "TRANSACTION_REVERTED",
          "Proposal transaction was mined but reverted. Verify the contract owner, proposal timing, and contract configuration.",
        );
      }
      if (error instanceof ChainEventNotFoundError) {
        throw new ApplicationError("CHAIN_EVENT_MISSING", error.message);
      }
      throw error;
    }
    const now = this.clock.now();
    await this.transactionManager.runInTransaction(async () => {
      await this.proposals.markPublished(
        proposal.id,
        result.onChainProposalId,
        ProposalStatus.PendingOnChain,
        now,
      );
      await this.transactions.record({
        ...result,
        operation: "CREATE_PROPOSAL",
        proposalId: proposal.id,
        walletAddress: actorAddress,
        recordedAt: now,
      });
    });
    return result;
  }
}
