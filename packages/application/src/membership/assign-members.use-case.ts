import { WalletAddress } from "@dao-platform/domain";
import { AssignmentRepository } from "../ports/assignment-repository.js";
import { ChainTransactionRepository } from "../ports/chain-transaction-repository.js";
import { Clock } from "../ports/clock.js";
import { GovernanceChainGateway } from "../ports/governance-chain.gateway.js";
import { ProposalAuthorization } from "../ports/proposal-authorization.js";
import { ProposalRepository } from "../ports/proposal-repository.js";
import { TransactionManager } from "../ports/transaction-manager.js";
import { ApplicationError } from "../shared/application.error.js";

export class AssignMembersUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly assignments: AssignmentRepository,
    private readonly transactions: ChainTransactionRepository,
    private readonly authorization: ProposalAuthorization,
    private readonly chain: GovernanceChainGateway,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(
    proposalId: string,
    actorAddress: string,
    memberAddresses: readonly string[],
  ) {
    if (memberAddresses.length < 1 || memberAddresses.length > 200) {
      throw new ApplicationError(
        "INVALID_MEMBER_BATCH",
        "Assign between 1 and 200 members per request.",
      );
    }
    const members = memberAddresses.map(
      (address) => WalletAddress.create(address).value,
    );
    if (new Set(members).size !== members.length) {
      throw new ApplicationError(
        "DUPLICATE_MEMBER",
        "Member addresses must be unique.",
      );
    }
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
        "Publish the proposal on-chain before assigning members.",
      );
    }

    const result = await this.chain.assignMembers(proposal.onChainId, members);
    const now = this.clock.now();
    await this.transactionManager.runInTransaction(async () => {
      await this.assignments.addMany(
        members.map((walletAddress) => ({
          proposalId,
          walletAddress,
          transactionHash: result.transactionHash,
          assignedAt: now,
        })),
      );
      await this.transactions.record({
        ...result,
        operation: "ASSIGN_MEMBERS",
        proposalId,
        walletAddress: actorAddress,
        recordedAt: now,
      });
    });
    return { members, transaction: result };
  }
}
