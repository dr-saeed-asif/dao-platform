import { validate } from 'class-validator';
import { ProposalType } from '@dao-platform/domain';
import { CreateProposalDto } from './create-proposal.dto';

function validDto(): CreateProposalDto {
  return Object.assign(new CreateProposalDto(), {
    daoId: 'dao-1',
    title: 'Fund security audit',
    purpose: 'Improve protocol safety',
    description: 'Fund an independent contract security audit.',
    type: ProposalType.Standard,
    optionLabels: ['Approve', 'Reject'],
    startsAt: '2026-10-07T18:03:00.000Z',
    endsAt: '2026-10-07T19:10:00.000+00:00',
    metadataURI: 'ipfs://proposal',
    metadataHash: `0x${'11'.repeat(32)}`,
  });
}

describe('CreateProposalDto timestamps', () => {
  it('accepts ISO timestamps with explicit UTC offsets', async () => {
    await expect(validate(validDto())).resolves.toEqual([]);
  });

  it('rejects timezone-ambiguous timestamps', async () => {
    const errors = await validate(Object.assign(validDto(), {
      startsAt: '2026-10-07T18:03:00',
    }));

    expect(errors.find(error => error.property === 'startsAt')?.constraints?.matches)
      .toBe('startsAt must include an explicit UTC offset.');
  });
});
