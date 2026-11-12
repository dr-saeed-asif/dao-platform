export class RpcFault extends Error {
  status: number;
  code: number;
  constructor(status: number, code: number, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface RpcCall {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params: string[];
}

const address = /^0x[0-9a-fA-F]{40}$/;
const hash = /^0x[0-9a-fA-F]{64}$/;
const block = /^(latest|pending|earliest|safe|finalized|0x[0-9a-fA-F]{1,64})$/;

export function parseCalls(body: unknown): RpcCall[] {
  const batch = Array.isArray(body) ? body : [body];
  if (!batch.length || batch.length > 10)
    throw new RpcFault(400, -32600, 'Provide one to ten RPC requests.');
  return batch.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new RpcFault(400, -32600, 'Invalid RPC request.');
    const row = value as Record<string, unknown>;
    if (
      row.jsonrpc !== '2.0' ||
      !Object.hasOwn(row, 'id') ||
      !(
        row.id === null ||
        (typeof row.id === 'string' && row.id.length <= 64) ||
        (typeof row.id === 'number' && Number.isSafeInteger(row.id))
      ) ||
      typeof row.method !== 'string' ||
      !Array.isArray(row.params) ||
      !row.params.every((p: unknown) => typeof p === 'string')
    )
      throw new RpcFault(400, -32600, 'Invalid RPC request.');
    const params = row.params;
    let valid: boolean;
    switch (row.method) {
      case 'eth_chainId':
        valid = params.length === 0;
        break;
      case 'eth_getRole':
      case 'eth_getTransactionCount':
        valid =
          params.length === 2 &&
          address.test(params[0]) &&
          block.test(params[1]);
        break;
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt':
        valid = params.length === 1 && hash.test(params[0]);
        break;
      case 'eth_sendRawTransaction':
        valid =
          params.length === 1 &&
          params[0].length <= 49_154 &&
          /^0x(?:[0-9a-fA-F]{2})+$/.test(params[0]);
        break;
      default:
        throw new RpcFault(400, -32601, 'Unsupported RPC method.');
    }
    if (!valid) throw new RpcFault(400, -32602, 'Invalid RPC parameters.');
    return {
      jsonrpc: '2.0',
      id: row.id,
      method: row.method,
      params,
    };
  });
}

export function rpcEndpoint(
  value: string | undefined,
  production: boolean,
): URL {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.hash ||
      !['https:', 'http:'].includes(url.protocol) ||
      (production && url.protocol !== 'https:')
    )
      throw new Error();
    return url;
  } catch {
    throw new RpcFault(503, -32000, 'RPC service is not configured securely.');
  }
}
