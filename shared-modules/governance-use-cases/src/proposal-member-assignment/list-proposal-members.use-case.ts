import { AssignmentRepository } from "../dependency-interfaces/proposal-member-assignment-repository.interface.js";

export class ListMembersUseCase {
  constructor(private readonly assignments: AssignmentRepository) {}

  execute(proposalId: string) {
    return this.assignments.list(proposalId);
  }
}
