import { normalizePythonAnswer, queryPythonAi, queryPythonAiBatch } from '../python-ai.adapter';
import type { AiBatchQueryRequest, AiQueryRequest } from '../ai.dto';

const request: AiQueryRequest & { daoId: string } = { daoId: 'dao-1', question: 'Summarize this proposal.', proposalId: 'local-1', system: 'hybrid' };
describe('Python AI integration', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('adapts governance objects and PDF citations to the existing modal and reports', () => {
    const answer = normalizePythonAnswer({
      runId: 'run-1', system: 'hybrid', answer: 'Summary [G1] [D1]', latencyMs: 12.7,
      evidence: [
        { source_id: 'G1', source: 'governance-db', content: { status: 'ACTIVE' } },
        { source_id: 'D1', chunk_key: 'chunk-1', artefact_evidence_id: 'artefact-1',
          content: 'PDF evidence', page_number: 2, score: 0.9 },
      ], tokens: { input_tokens: 30, output_tokens: 10 },
      models: { chat: 'ollama:actual-model', embedding: 'ollama:embed', embeddingDimension: 1024 },
    }, request);
    expect(answer.retrieval).toEqual([{ chunkEvidenceId: 'chunk-1', rank: 1, score: 0.9 }]);
    expect(answer.evidence[0].content).toContain('ACTIVE');
    expect(answer.evidence[1].content).toContain('[D1] Page 2');
    expect(answer.inputTokens).toBe(30);
    expect(answer.latencyMs).toBe(13);
    expect(answer.models?.chat).toBe('ollama:actual-model');
  });

  it('rejects unsupported modes instead of silently using the old AI', async () => {
    global.fetch = jest.fn();
    await expect(queryPythonAi({ ...request, system: 'multi-agent' as any }, 'http://127.0.0.1:8001', 'secret', AbortSignal.timeout(1000)))
      .rejects.toThrow('currently supports');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the Python credential on the server and passes the selected proposal', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      runId: 'run-1', system: 'hybrid', answer: 'Answer', evidence: [], latencyMs: 1,
    }) });
    await queryPythonAi(request, 'http://127.0.0.1:8001', 'server-secret', AbortSignal.timeout(1000));
    expect(global.fetch).toHaveBeenCalledWith(new URL('http://127.0.0.1:8001/v1/ai/query'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer server-secret' }), body: JSON.stringify(request), cache: 'no-store',
    }));
  });

  it('rejects malformed upstream answers and surfaces provider errors', async () => {
    expect(() => normalizePythonAnswer({ answer: 'Missing run and evidence' }, request)).toThrow('invalid answer format');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(queryPythonAi(request, 'http://127.0.0.1:8001', 'incorrect', AbortSignal.timeout(1000)))
      .rejects.toThrow('credentials do not match');
  });

  it('forwards five and ten questions through the server-only batch bridge', async () => {
    const body = (count: number): AiBatchQueryRequest & { daoId: string } => ({
      daoId: 'dao-1', proposalId: 'proposal-1', system: 'hybrid',
      questions: Array.from({ length: count }, (_, index) => `Question ${index + 1}?`),
    });
    global.fetch = jest.fn().mockImplementation(async (_url, init) => {
      const sent = JSON.parse(init.body as string);
      return { ok: true, json: async () => ({ batchId: 'batch-1', system: 'hybrid',
        status: 'completed', scope: { dao_id: sent.daoId, proposal_id: sent.proposalId },
        results: sent.questions.map((question: string, index: number) => ({ questionId: `q${index + 1}`, question,
          answer: 'Answer', citations: [], evidence: [], errors: [], metrics: {} })),
        evidence: [], errors: [], toolErrors: [], metrics: {}, toolTraces: [] }) };
    });
    for (const count of [5, 10]) {
      const requestBody = body(count);
      const response = await queryPythonAiBatch(requestBody, 'http://127.0.0.1:8001',
        'server-only-token', AbortSignal.timeout(1000));
      expect(response.results).toHaveLength(count);
    }
    const lastCall = (global.fetch as jest.Mock).mock.calls.at(-1);
    expect(lastCall[1].headers.Authorization).toBe('Bearer server-only-token');
    expect(JSON.parse(lastCall[1].body).questions).toHaveLength(10);
  });

  it('accepts a 200-character question and rejects 201 before the Python request', async () => {
    const requestBody: AiBatchQueryRequest & { daoId: string } = {
      daoId: 'dao-1', proposalId: 'proposal-1', system: 'hybrid', questions: ['x'.repeat(200)],
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      batchId: 'batch-1', system: 'hybrid', status: 'completed', scope: { dao_id: 'dao-1', proposal_id: 'proposal-1' },
      results: [{ questionId: 'q1', question: requestBody.questions[0], answer: 'Answer',
        citations: [], evidence: [], errors: [], metrics: {} }],
      evidence: [], errors: [], toolErrors: [], metrics: {}, toolTraces: [],
    }) });
    await expect(queryPythonAiBatch(requestBody, 'http://127.0.0.1:8001', 'server-token', AbortSignal.timeout(1000)))
      .resolves.toMatchObject({ batchId: 'batch-1' });
    await expect(queryPythonAiBatch({ ...requestBody, questions: ['x'.repeat(201)] },
      'http://127.0.0.1:8001', 'server-token', AbortSignal.timeout(1000))).rejects.toThrow('200 characters');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
