import { WalletAddress } from "@dao-platform/domain";
import { AssignmentRepository } from "../dependency-interfaces/proposal-member-assignment-repository.interface.js";
import { ChainTransactionRepository } from "../dependency-interfaces/blockchain-transaction-repository.interface.js";
import { Clock } from "../dependency-interfaces/current-time.interface.js";
import { GovernanceChainGateway } from "../dependency-interfaces/governance-blockchain-gateway.interface.js";
import { ProposalAuthorization } from "../dependency-interfaces/governance-proposal-authorization.interface.js";
import { ProposalRepository } from "../dependency-interfaces/governance-proposal-repository.interface.js";
import { TransactionManager } from "../dependency-interfaces/database-transaction-manager.interface.js";
import { ApplicationError } from "../use-case-errors/governance-use-case.error.js";

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
