import type {
  GovernanceEventEnvelope,
  GovernanceEventRepository,
  ListGovernanceEventsQuery,
  StoredGovernanceEvent,
} from '@dao-platform/application';

export class UnavailableGovernanceEventRepository
  implements GovernanceEventRepository
{
  saveGovernanceEvent(_event: GovernanceEventEnvelope): Promise<void> {
    return Promise.reject(this.error());
  }

  findGovernanceEventByEvidenceId(
    _evidenceId: string,
  ): Promise<StoredGovernanceEvent | null> {
    return Promise.reject(this.error());
  }

  listGovernanceEvents(
    _query: ListGovernanceEventsQuery,
  ): Promise<readonly StoredGovernanceEvent[]> {
    return Promise.reject(this.error());
  }

  eventExists(_evidenceId: string): Promise<boolean> {
    return Promise.reject(this.error());
  }

  private error(): Error {
    return new Error(
      'POSTGRES_URL is required for durable governance event synchronization.',
    );
  }
}
