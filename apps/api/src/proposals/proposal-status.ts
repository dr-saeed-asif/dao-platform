export interface ProposalStatusSnapshot {
  status: string;
  databaseStatus: string;
  timeStatus: 'UPCOMING' | 'ACTIVE' | 'ENDED';
  statusSource: string;
}

export function proposalStatusAt(databaseStatus: string, startsAt: Date,
  endsAt: Date, asOf: Date): ProposalStatusSnapshot {
  const timeStatus = asOf < startsAt ? 'UPCOMING' : asOf < endsAt ? 'ACTIVE' : 'ENDED';
  const terminal = ['CANCELLED', 'CLOSED', 'EXECUTED', 'FAILED'].includes(databaseStatus);
  const pending = ['DRAFT', 'PENDING_ON_CHAIN'].includes(databaseStatus);
  return {
    status: terminal || pending ? databaseStatus : timeStatus,
    databaseStatus,
    timeStatus,
    statusSource: terminal ? 'indexed governance lifecycle' : 'database timestamps evaluated at asOf',
  };
}
