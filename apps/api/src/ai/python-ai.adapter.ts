import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { AiQueryRequest, AiQueryResponse } from './ai.dto';

export async function queryPythonAi(
  request: AiQueryRequest, origin: string, token: string, signal: AbortSignal,
): Promise<AiQueryResponse> {
  if (!request.proposalId) throw new BadRequestException('Select a proposal before asking the AI assistant.');
  if (!['hybrid', 'vector-rag'].includes(request.system))
    throw new BadRequestException('Python AI currently supports Hybrid and Vector RAG.');
  if (request.datasetVersion || request.policyVersion)
    throw new BadRequestException('Dataset and policy versioning are not yet supported by Python AI.');
  if (!token) throw new ServiceUnavailableException('Python AI connection is not configured.');
  const endpoint = new URL('/v1/ai/query', origin);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
    throw new ServiceUnavailableException('Python AI must use a local server address.');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new BadGatewayException('Python AI is unavailable or timed out. Check the AI server on port 8001.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 422) throw new BadRequestException(
      typeof body?.detail === 'string' ? body.detail : 'Python AI could not use the selected proposal or question.',
    );
    throw new BadGatewayException(response.status === 401
      ? 'Python AI credentials do not match the server configuration.'
      : 'Python AI could not complete the answer. Check its server logs.');
  }
  return normalizePythonAnswer(body, request);
}

export function normalizePythonAnswer(body: any, request: AiQueryRequest): AiQueryResponse {
  if (!body || typeof body.runId !== 'string' || !body.runId || typeof body.answer !== 'string' ||
      !Array.isArray(body.evidence) || !Number.isFinite(body.latencyMs) || body.system !== request.system)
    throw new BadGatewayException('Python AI returned an invalid answer format.');
  const evidence = body.evidence.map((item: any, index: number) => ({
    evidenceId: item.chunk_key ?? `structured:proposal:${request.proposalId}`,
    chunkEvidenceId: item.chunk_key ?? `structured:proposal:${request.proposalId}`,
    artefactEvidenceId: item.artefact_evidence_id ?? '',
    sourceType: item.source === 'governance-db' ? 'governance-db' : 'document',
    proposalId: request.proposalId ?? null,
    filename: item.filename ?? null,
    content: `[${item.source_id ?? index + 1}]${item.page_number ? ` Page ${item.page_number}` : ''}\n` +
      (typeof item.content === 'string' ? item.content : JSON.stringify(item.content)),
    score: typeof item.score === 'number' ? item.score : 0,
    rank: index + 1,
  }));
  return {
    runId: body.runId, system: request.system, answer: body.answer, evidence,
    retrieval: evidence.filter((_: unknown, index: number) => body.evidence[index].chunk_key)
      .map((item: AiQueryResponse['evidence'][number], index: number) => ({
        chunkEvidenceId: item.chunkEvidenceId, score: item.score, rank: index + 1,
      })),
    latencyMs: Math.round(body.latencyMs),
    retrievalLatencyMs: body.retrievalLatencyMs,
    generationLatencyMs: body.generationLatencyMs,
    inputTokens: body.tokens?.input_tokens,
    outputTokens: body.tokens?.output_tokens,
    models: body.models,
  };
}
