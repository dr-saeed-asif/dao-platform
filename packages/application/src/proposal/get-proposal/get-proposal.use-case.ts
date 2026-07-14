import { ProposalRepository } from "../../ports/proposal-repository.js";
import { ApplicationError } from "../../shared/application.error.js";
import { ProposalView, toProposalView } from "../proposal.view.js";

export class GetProposalUseCase {
  constructor(private readonly proposals: ProposalRepository) {}

  async execute(id: string): Promise<ProposalView> {
    const proposal = await this.proposals.findById(id);
    if (!proposal) {
      throw new ApplicationError("PROPOSAL_NOT_FOUND", "Proposal not found.");
    }
    return toProposalView(proposal);
  }
}
