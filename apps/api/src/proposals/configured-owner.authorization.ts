import {
  ProposalAuthorization,
  ApplicationError,
} from '@dao-platform/application';

export class ConfiguredOwnerAuthorization implements ProposalAuthorization {
  constructor(private readonly ownerAddress: string) {}

  assertCanCreateProposal(request: {
    actorAddress: string;
    daoId: string;
  }): Promise<void> {
    if (
      request.actorAddress.toLowerCase() !== this.ownerAddress.toLowerCase()
    ) {
      throw new ApplicationError(
        'FORBIDDEN',
        'Only the configured DAO administrator can create proposals.',
      );
    }
    return Promise.resolve();
  }
}
