import { Proposal } from "@dao-platform/domain";

export interface SaveProposalOptions {
  readonly idempotencyKey: string;
}

export interface ProposalRepository {
  findById(id: string): Promise<Proposal | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<Proposal | null>;
  insert(proposal: Proposal, options: SaveProposalOptions): Promise<void>;
}
