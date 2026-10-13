import { ProposalStatus } from "@dao-platform/domain";
import { ChainTransactionRepository } from "../../dependency-interfaces/blockchain-transaction-repository.interface.js";
import { GovernanceChainGateway } from "../../dependency-interfaces/governance-blockchain-gateway.interface.js";
import { ProposalAuthorization } from "../../dependency-interfaces/governance-proposal-authorization.interface.js";
import { ProposalRepository } from "../../dependency-interfaces/governance-proposal-repository.interface.js";
import { TransactionManager } from "../../dependency-interfaces/database-transaction-manager.interface.js";
import { ApplicationError } from "../../use-case-errors/governance-use-case.error.js";

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
