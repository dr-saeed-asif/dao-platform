export interface CreateProposalAuthorizationRequest {
  readonly actorAddress: string;
  readonly daoId: string;
}

export interface ProposalAuthorization {
  assertCanCreateProposal(
    request: CreateProposalAuthorizationRequest,
  ): Promise<void>;
}
