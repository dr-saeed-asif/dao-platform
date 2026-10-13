import { VoteRepository } from "../dependency-interfaces/proposal-vote-repository.interface.js";

export class ListVotesUseCase {
  constructor(private readonly votes: VoteRepository) {}
  execute(proposalId: string) {
    return this.votes.list(proposalId);
  }
}
