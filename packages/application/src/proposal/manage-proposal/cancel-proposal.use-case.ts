import { ProposalStatus } from "@dao-platform/domain";
import { ChainTransactionRepository } from "../../ports/chain-transaction-repository.js";
import { GovernanceChainGateway } from "../../ports/governance-chain.gateway.js";
import { ProposalAuthorization } from "../../ports/proposal-authorization.js";
import { ProposalRepository } from "../../ports/proposal-repository.js";
import { TransactionManager } from "../../ports/transaction-manager.js";
import { ApplicationError } from "../../shared/application.error.js";

export class CancelProposalUseCase {
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
    await this.authorization.assertCanCreateProposal({
      actorAddress,
      daoId: proposal.daoId,
    });
    const result = await this.chain.cancelProposal(proposal.onChainId);
    const now = new Date();
    await this.transactionManager.runInTransaction(async () => {
      await this.proposals.updateStatus(id, ProposalStatus.Cancelled, now);
      await this.transactions.record({
        ...result,
        operation: "CANCEL_PROPOSAL",
        proposalId: id,
        walletAddress: actorAddress,
        recordedAt: now,
      });
    });
    return result;
  }
}
