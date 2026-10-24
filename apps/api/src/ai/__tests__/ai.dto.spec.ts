import { validate } from 'class-validator';
import { AiBatchQueryRequest, AiQueryRequest } from '../ai.dto';

function request(questions: string[], system = 'hybrid') {
  return Object.assign(new AiBatchQueryRequest(), {
    proposalId: 'proposal-1', system, questions,
  });
}

describe('AiBatchQueryRequest', () => {
  it.each([5, 10])('accepts a batch of %i questions', async (count) => {
    expect(await validate(request(Array.from({ length: count }, () => 'Question?')))).toHaveLength(0);
  });

  it('accepts exactly 200 characters and rejects 201', async () => {
    expect(await validate(request(['x'.repeat(200)]))).toHaveLength(0);
    expect(await validate(request(['x'.repeat(201)]))).not.toHaveLength(0);
  });

  it('rejects empty questions, invalid batch sizes, and unsupported systems', async () => {
    for (const body of [request([]), request(['  ']), request(Array(11).fill('Question?')),
      request(['Question?'], 'single-agent')]) {
      expect(await validate(body)).not.toHaveLength(0);
    }
  });
});

describe('AiQueryRequest', () => {
  it('accepts only api-ai-server single-query modes', async () => {
    const valid = Object.assign(new AiQueryRequest(), {
      proposalId: 'proposal-1', question: 'Summarize this proposal.', system: 'hybrid', topK: 4,
    });
    expect(await validate(valid)).toHaveLength(0);

    for (const system of ['multi-agent', 'hybrid-verified', 'llm-only']) {
      expect(await validate(Object.assign(new AiQueryRequest(), { ...valid, system }))).not.toHaveLength(0);
    }
  });
});
