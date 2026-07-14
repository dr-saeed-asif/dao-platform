import { AssignmentRepository } from "../ports/assignment-repository.js";

export class ListMembersUseCase {
  constructor(private readonly assignments: AssignmentRepository) {}

  execute(proposalId: string) {
    return this.assignments.list(proposalId);
  }
}
