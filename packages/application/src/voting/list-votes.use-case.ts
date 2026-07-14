import { VoteRepository } from "../ports/vote-repository.js";

export class ListVotesUseCase {
  constructor(private readonly votes: VoteRepository) {}
  execute(proposalId: string) {
    return this.votes.list(proposalId);
  }
}
