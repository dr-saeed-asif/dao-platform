import { WalletAddress } from "@dao-platform/domain";
import { AssignmentRepository } from "../dependency-interfaces/proposal-member-assignment-repository.interface.js";
import { ChainTransactionRepository } from "../dependency-interfaces/blockchain-transaction-repository.interface.js";
import { Clock } from "../dependency-interfaces/current-time.interface.js";
import { GovernanceChainGateway } from "../dependency-interfaces/governance-blockchain-gateway.interface.js";
import { ProposalAuthorization } from "../dependency-interfaces/governance-proposal-authorization.interface.js";
import { ProposalRepository } from "../dependency-interfaces/governance-proposal-repository.interface.js";
import { TransactionManager } from "../dependency-interfaces/database-transaction-manager.interface.js";
import { ApplicationError } from "../use-case-errors/governance-use-case.error.js";

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
