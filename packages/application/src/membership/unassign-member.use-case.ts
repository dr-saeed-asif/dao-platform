import { WalletAddress } from "@dao-platform/domain";
import { AssignmentRepository } from "../ports/assignment-repository.js";
import { ChainTransactionRepository } from "../ports/chain-transaction-repository.js";
import { Clock } from "../ports/clock.js";
import { GovernanceChainGateway } from "../ports/governance-chain.gateway.js";
import { ProposalAuthorization } from "../ports/proposal-authorization.js";
import { ProposalRepository } from "../ports/proposal-repository.js";
import { TransactionManager } from "../ports/transaction-manager.js";
import { ApplicationError } from "../shared/application.error.js";

export class UnassignMemberUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly assignments: AssignmentRepository,
    private readonly transactions: ChainTransactionRepository,
    private readonly authorization: ProposalAuthorization,
    private readonly chain: GovernanceChainGateway,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(proposalId: string, actorAddress: string, member: string) {
    const walletAddress = WalletAddress.create(member).value;
    const proposal = await this.proposals.findById(proposalId);
    if (!proposal) {
      throw new ApplicationError("PROPOSAL_NOT_FOUND", "Proposal not found.");
    }
    await this.authorization.assertCanCreateProposal({
      actorAddress,
      daoId: proposal.daoId,
    });
    if (!proposal.onChainId) {
      throw new ApplicationError(
        "PROPOSAL_NOT_PUBLISHED",
        "Proposal is not published on-chain.",
      );
    }
    const result = await this.chain.unassignMember(
      proposal.onChainId,
      walletAddress,
    );
    const now = this.clock.now();
    await this.transactionManager.runInTransaction(async () => {
      await this.assignments.remove(proposalId, walletAddress);
      await this.transactions.record({
        ...result,
        operation: "UNASSIGN_MEMBER",
        proposalId,
        walletAddress: actorAddress,
        recordedAt: now,
      });
    });
    return result;
  }
}
