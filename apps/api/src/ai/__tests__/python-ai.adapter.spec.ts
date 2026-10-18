import { normalizePythonAnswer, queryPythonAi } from '../python-ai.adapter';
import type { AiQueryRequest } from '../ai.dto';

const request: AiQueryRequest = { question: 'Summarize this proposal.', proposalId: 'local-1', system: 'hybrid' };
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
    await expect(queryPythonAi({ ...request, system: 'multi-agent' }, 'http://127.0.0.1:8001', 'secret', AbortSignal.timeout(1000)))
      .rejects.toThrow('currently supports');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the Python credential on the server and passes the selected proposal', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      runId: 'run-1', system: 'hybrid', answer: 'Answer', evidence: [], latencyMs: 1,
    }) });
    await queryPythonAi(request, 'http://127.0.0.1:8001', 'server-secret', AbortSignal.timeout(1000));
    expect(global.fetch).toHaveBeenCalledWith(new URL('http://127.0.0.1:8001/v1/ai/query'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer server-secret' }), body: JSON.stringify(request),
    }));
  });

  it('rejects malformed upstream answers and surfaces provider errors', async () => {
    expect(() => normalizePythonAnswer({ answer: 'Missing run and evidence' }, request)).toThrow('invalid answer format');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(queryPythonAi(request, 'http://127.0.0.1:8001', 'incorrect', AbortSignal.timeout(1000)))
      .rejects.toThrow('credentials do not match');
  });
});
