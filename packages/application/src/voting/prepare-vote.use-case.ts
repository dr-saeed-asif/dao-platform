import { WalletAddress } from "@dao-platform/domain";
import { AssignmentRepository } from "../ports/assignment-repository.js";
import { GovernanceChainGateway } from "../ports/governance-chain.gateway.js";
import { ProposalRepository } from "../ports/proposal-repository.js";
import { VoteRepository } from "../ports/vote-repository.js";
import { ApplicationError } from "../shared/application.error.js";

export class PrepareVoteUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly assignments: AssignmentRepository,
    private readonly votes: VoteRepository,
    private readonly chain: GovernanceChainGateway,
  ) {}

  async execute(proposalId: string, voter: string, optionIndex: number) {
    const voterAddress = WalletAddress.create(voter).value;
    const proposal = await this.proposals.findById(proposalId);
    if (!proposal?.onChainId) {
      throw new ApplicationError(
        "PROPOSAL_NOT_PUBLISHED",
        "Proposal is not published on-chain.",
      );
    }
    if (
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= proposal.options.length
    ) {
      throw new ApplicationError(
        "INVALID_OPTION",
        "Invalid voting option index.",
      );
    }
    const assigned = await this.assignments.list(proposalId);
    if (!assigned.some((record) => record.walletAddress === voterAddress)) {
      throw new ApplicationError(
        "MEMBER_NOT_ASSIGNED",
        "Wallet is not assigned to this proposal.",
      );
    }
    if (await this.votes.findByProposalAndVoter(proposalId, voterAddress)) {
      throw new ApplicationError(
        "ALREADY_VOTED",
        "Wallet has already voted on this proposal.",
      );
    }
    const now = new Date();
    if (now < proposal.startsAt || now >= proposal.endsAt) {
      throw new ApplicationError(
        "VOTING_NOT_ACTIVE",
        "The proposal voting period is not active.",
      );
    }
    return this.chain.prepareVote(
      proposal.onChainId,
      voterAddress,
      optionIndex,
    );
  }
}
