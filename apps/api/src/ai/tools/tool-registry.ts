import { requestSignal, checkRequestBudget } from '../request-budget';
import { Injectable } from '@nestjs/common';
import type { AgentName, AgentToolCall } from '../agents/agent.types';
import {
  ToolExecutionError,
  type AiTool,
  type ToolContext,
} from './tool.types';

/** Compatibility contract for existing internal tools. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  allowedAgents: AgentName[];
  timeoutMs: number;
  readOnly: true;
  validate(input: Record<string, unknown>): void;
  execute(
    input: Record<string, unknown>,
    context?: ToolContext,
  ): Promise<unknown>;
}

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly parsers = new Map<string, (input: unknown) => unknown>();

  has(name: string): boolean {
    return this.tools.has(name);
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name))
      throw new Error(`Tool already registered: ${tool.name}`);
    if (tool.readOnly !== true)
      throw new Error('Only read-only query tools may be registered.');
    if (!Number.isSafeInteger(tool.timeoutMs) || tool.timeoutMs <= 0)
      throw new Error('A positive tool timeout is required.');
    this.tools.set(tool.name, tool);
  }

  registerAiTool<Input, Output>(
    tool: AiTool<Input, Output>,
    allowedAgents: AgentName[],
  ): void {
    if (!tool.readOnly)
      throw new Error('Only read-only query tools may be registered.');
    if (this.parsers.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    // Typed tools are the canonical implementations. A legacy compatibility
    // registration may exist during module initialization; replace it here.
    this.tools.delete(tool.name);
    this.register({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema.jsonSchema,
      outputSchema: { type: 'object' },
      allowedAgents,
      timeoutMs: tool.timeoutMs,
      readOnly: true,
      validate: () => {},
      execute: (input, context) => tool.execute(input as Input, context ?? {}),
    });
    this.parsers.set(tool.name, (input) => tool.inputSchema.parse(input));
  }

  list(agent?: AgentName) {
    return [...this.tools.values()]
      .filter((tool) => !agent || tool.allowedAgents.includes(agent))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        allowedAgents: tool.allowedAgents,
        timeoutMs: tool.timeoutMs,
        readOnly: tool.readOnly,
      }));
  }

  async invoke(
    agent: AgentName,
    name: string,
    args: unknown,
    context: ToolContext = {},
  ): Promise<{ result: unknown; call: AgentToolCall }> {
    checkRequestBudget();
    const inherited = requestSignal();
    if (inherited) context = { ...context, signal: context.signal ? AbortSignal.any([context.signal, inherited]) : inherited };
    const started = Date.now();
    // Only metadata belongs in tool observability, never arguments or results.
    const call: AgentToolCall = { tool: name, evidenceIds: [] };
    try {
      const tool = this.tools.get(name);
      if (!tool)
        throw new ToolExecutionError('UNKNOWN_TOOL', `Unknown tool: ${name}`);
      if (!tool.allowedAgents.includes(agent))
        throw new ToolExecutionError(
          'NOT_ALLOWED',
          `Agent ${agent} is not allowed to call ${name}`,
        );
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new ToolExecutionError(
          'INVALID_INPUT',
          'Tool arguments must be an object.',
        );
      const input = (this.parsers.get(name)?.(args) ?? args) as Record<
        string,
        unknown
      >;
      tool.validate(input);
      const result = await executeWithDeadline(tool, input, context);
      return {
        result,
        call: {
          ...call,
          status: 'success',
          latencyMs: Date.now() - started,
          evidenceIds: getEvidenceIds(result),
        },
      };
    } catch (error) {
      const failure =
        error instanceof Error ? error : new Error('Tool execution failed.');
      throw Object.assign(failure, {
        toolCall: { ...call, status: 'error', latencyMs: Date.now() - started },
      });
    }
  }
}

async function executeWithDeadline(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      const stop = (error: ToolExecutionError) => {
        controller.abort(error);
        reject(error);
      };
      onAbort = () =>
        stop(
          new ToolExecutionError(
            'CANCELLED',
            `Tool ${tool.name} was cancelled.`,
          ),
        );
      if (context.signal?.aborted) {
        onAbort();
        return;
      }
      context.signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(
        () =>
          stop(
            new ToolExecutionError(
              'TIMEOUT',
              `Tool ${tool.name} timed out after ${tool.timeoutMs}ms`,
            ),
          ),
        tool.timeoutMs,
      );
    });
    const work = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return tool.execute(input, { ...context, signal: controller.signal });
    });
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
    if (onAbort) context.signal?.removeEventListener('abort', onAbort);
  }
}

function getEvidenceIds(result: unknown): string[] {
  if (!result || typeof result !== 'object' || !('evidenceIds' in result))
    return [];
  return Array.isArray(result.evidenceIds)
    ? [
        ...new Set(
          result.evidenceIds.filter(
            (id): id is string => typeof id === 'string',
          ),
        ),
      ]
    : [];
}

export function requireString(input: Record<string, unknown>, name: string) {
  if (typeof input[name] !== 'string' || !String(input[name]).trim())
    throw new Error(`Invalid arguments: ${name} is required`);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
