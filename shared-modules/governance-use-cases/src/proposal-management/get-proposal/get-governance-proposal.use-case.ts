import { ProposalRepository } from "../../dependency-interfaces/governance-proposal-repository.interface.js";
import { ApplicationError } from "../../use-case-errors/governance-use-case.error.js";
import { ProposalView, toProposalView } from "../governance-proposal.view.js";

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
