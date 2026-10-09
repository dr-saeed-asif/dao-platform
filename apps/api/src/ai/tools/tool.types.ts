export interface Schema<Input> {
  jsonSchema: Record<string, unknown>;
  parse(input: unknown): Input;
}

export interface ToolContext {
  /** Trusted application scope; never taken from the tool arguments. */
  daoId?: string;
  userId?: string;
  requestId?: string;
  signal?: AbortSignal;
}

export interface AiTool<Input, Output> {
  name: string;
  description: string;
  inputSchema: Schema<Input>;
  readOnly: boolean;
  timeoutMs: number;
  execute(input: Input, context: ToolContext): Promise<Output>;
}

export type ToolErrorCode =
  | 'UNKNOWN_TOOL'
  | 'NOT_ALLOWED'
  | 'INVALID_INPUT'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'EXECUTION_FAILED';

export class ToolExecutionError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}
