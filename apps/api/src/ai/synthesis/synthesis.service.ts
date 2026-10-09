import { Injectable } from '@nestjs/common';
import { OllamaClient, type OllamaChatResponse } from '../ollama.client';
import type { AnswerStatement } from '../orchestration/evidence-fusion';

@Injectable()
export class SynthesisService {
  constructor(private readonly provider: OllamaClient) {}

  async compliance(
    question: string,
    statements: AnswerStatement[],
    signal?: AbortSignal,
  ) {
    // The model may organize the explanation, but every rendered verdict and
    // citation comes from the deterministic service output.
    let response: OllamaChatResponse;
    try {
      response = await this.provider.chat(
        [
          {
            role: 'system',
            content:
              'Organize these governance compliance statements to answer the question. Return JSON only: {"statementIds":["..."]}. Include every statement exactly once. Do not calculate compliance, write SQL, or generate verdicts or evidence IDs.',
          },
          { role: 'user', content: JSON.stringify({ question, statements }) },
        ],
        { json: true, maxTokens: 512, signal },
      );
    } catch {
      signal?.throwIfAborted();
      return { ...deterministicStatements(statements), fallback: true };
    }
    let ordered = statements;
    try {
      const parsed: unknown = JSON.parse(response.content);
      const ids = (parsed as { statementIds?: unknown })?.statementIds;
      if (
        Array.isArray(ids) &&
        ids.length === statements.length &&
        new Set(ids).size === statements.length &&
        ids.every(
          (id) =>
            typeof id === 'string' &&
            statements.some((statement) => statement.id === id),
        )
      ) {
        ordered = ids.map((id) =>
          statements.find((statement) => statement.id === id)!,
        );
      }
    } catch {
      // Invalid model formatting cannot change or hide a compliance result.
    }
    return { ...deterministicStatements(ordered), response, fallback: false };
  }

  async proposalList(
    _question: string,
    statements: AnswerStatement[],
    _signal: AbortSignal,
  ) {
    return deterministicStatements(statements);
  }

  async daoStatistics(
    _question: string,
    statements: AnswerStatement[],
    _signal: AbortSignal,
  ) {
    return deterministicStatements(statements);
  }

  async proposalMembers(
    _question: string,
    statements: AnswerStatement[],
    _signal: AbortSignal,
  ) {
    return deterministicStatements(statements);
  }

  async proposalTransactions(
    _question: string,
    statements: AnswerStatement[],
    _signal: AbortSignal,
  ) {
    return deterministicStatements(statements);
  }

  async contractDeployment(
    _question: string,
    statements: AnswerStatement[],
    _signal: AbortSignal,
  ) {
    return deterministicStatements(statements);
  }

  async indexerStatus(
    _question: string,
    statements: AnswerStatement[],
    _signal: AbortSignal,
  ) {
    return deterministicStatements(statements);
  }

  async verifyAgainstRpc(
    _question: string,
    statements: AnswerStatement[],
    _signal: AbortSignal,
  ) {
    return deterministicStatements(statements);
  }
}

function deterministicStatements(statements: AnswerStatement[]) {
  const claims = statements.map((statement) => statement.claim);
  return {
    answer: claims
      .map(
        (claim, index) =>
          `${index ? '- ' : ''}${claim.text} [${claim.evidenceIds.join(', ')}]`,
      )
      .join('\n\n'),
    claims,
    response: { inputTokens: 0, outputTokens: 0 },
  };
}
