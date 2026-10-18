import { proposalStatusAt } from './proposal-status';

describe('proposalStatusAt', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-01-02T00:00:00Z');

  it('derives an expired window even if the stored status is ACTIVE', () => {
    expect(proposalStatusAt('ACTIVE', start, end, new Date('2026-01-03T00:00:00Z')))
      .toMatchObject({ status: 'ENDED', databaseStatus: 'ACTIVE', timeStatus: 'ENDED' });
  });

  it('preserves stored terminal lifecycle states', () => {
    expect(proposalStatusAt('CANCELLED', start, end, new Date('2026-01-03T00:00:00Z')).status)
      .toBe('CANCELLED');
  });
});
