import { ProposalRepository } from "../../ports/proposal-repository.js";
import { ProposalView, toProposalView } from "../proposal.view.js";

export interface ListProposalsQuery {
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListProposalsResult {
  readonly items: readonly ProposalView[];
  readonly limit: number;
  readonly offset: number;
}

export class ListProposalsUseCase {
  constructor(private readonly proposals: ProposalRepository) {}

  async execute(query: ListProposalsQuery): Promise<ListProposalsResult> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const proposals = await this.proposals.list(limit, offset);
    return { items: proposals.map(toProposalView), limit, offset };
  }
}
