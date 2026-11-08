import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssistantAskDto } from '../assistant.dto';

const ask = (question: unknown) =>
  validate(
    plainToInstance(AssistantAskDto, { proposalId: 'p-1', question }),
  );

describe('AssistantAskDto question limit', () => {
  it('accepts exactly 100 questions', async () => {
    expect(await ask(Array(100).fill('What is the status?'))).toHaveLength(0);
  });
  it('rejects 101 questions, empty lists and over-long questions', async () => {
    expect((await ask(Array(101).fill('What is the status?'))).length).toBeGreaterThan(0);
    expect((await ask([])).length).toBeGreaterThan(0);
    expect((await ask(['x'.repeat(4001)])).length).toBeGreaterThan(0);
  });
});
