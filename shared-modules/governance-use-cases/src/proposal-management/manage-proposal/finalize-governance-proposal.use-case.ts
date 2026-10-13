import { ProposalStatus } from "@dao-platform/domain";
import { ChainTransactionRepository } from "../../dependency-interfaces/blockchain-transaction-repository.interface.js";
import { GovernanceChainGateway } from "../../dependency-interfaces/governance-blockchain-gateway.interface.js";
import { ProposalAuthorization } from "../../dependency-interfaces/governance-proposal-authorization.interface.js";
import { ProposalRepository } from "../../dependency-interfaces/governance-proposal-repository.interface.js";
import { TransactionManager } from "../../dependency-interfaces/database-transaction-manager.interface.js";
import { ApplicationError } from "../../use-case-errors/governance-use-case.error.js";

export class FinalizeProposalUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly transactions: ChainTransactionRepository,
    private readonly authorization: ProposalAuthorization,
    private readonly chain: GovernanceChainGateway,
    private readonly transactionManager: TransactionManager,
  ) {}
  async execute(id: string, actorAddress: string) {
    const proposal = await this.proposals.findById(id);
    if (!proposal?.onChainId)
      throw new ApplicationError(
        "PROPOSAL_NOT_PUBLISHED",
        "Proposal is not published on-chain.",
      );
    if (proposal.status === ProposalStatus.Cancelled)
      throw new ApplicationError(
        "PROPOSAL_CANCELLED",
        "A cancelled proposal cannot be finalized.",
      );
    if (proposal.status === ProposalStatus.Closed)
      throw new ApplicationError(
        "PROPOSAL_ALREADY_FINALIZED",
        "This proposal has already been finalized.",
      );
    const now = new Date();
    if (now.getTime() < proposal.endsAt.getTime())
      throw new ApplicationError(
        "VOTING_PERIOD_NOT_ENDED",
        `The proposal can be finalized after ${proposal.endsAt.toISOString()}.`,
      );
    await this.authorization.assertCanCreateProposal({
      actorAddress,
      daoId: proposal.daoId,
    });
    let result;
    try {
      result = await this.chain.finalizeProposal(proposal.onChainId);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "CyberChain rejected the transaction.";
      throw new ApplicationError(
        "FINALIZATION_FAILED",
        `CyberChain could not finalize this proposal: ${detail}`,
      );
    }
    await this.transactionManager.runInTransaction(async () => {
      await this.proposals.updateStatus(id, ProposalStatus.Closed, now);
      await this.transactions.record({
        ...result,
        operation: "FINALIZE_PROPOSAL",
        proposalId: id,
        walletAddress: actorAddress,
        recordedAt: now,
      });
    });
    return result;
  }
}
