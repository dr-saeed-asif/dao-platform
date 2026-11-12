import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Common } from '@ethereumjs/common';
import { LegacyTransaction, TransactionFactory } from '@cyberchain/tx';
import { Interface } from 'ethers';
import { AssistantAuthService } from '../ai/assistant-auth.service';
import { PostgresService } from '../database/postgres.service';
import { consumeRpcBudget } from './rpc-budget';
import { parseCalls, rpcEndpoint, RpcFault, type RpcCall } from './rpc-policy';

const votes = new Interface([
  'function vote(uint256 proposalId, uint16 optionIndex)',
]);

@Controller('cyberchain/rpc')
export class RpcController {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AssistantAuthService,
    private readonly postgres: PostgresService,
  ) {}

  @Post()
  async relay(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    let calls: RpcCall[] = [];
    try {
      if (Buffer.byteLength(JSON.stringify(body) ?? '') > 65_536)
        throw new RpcFault(413, -32600, 'RPC body is too large.');
      calls = parseCalls(body);
      const production = this.config.get<string>('NODE_ENV') === 'production';
      const allowedOrigin = this.config.get<string>('RPC_WEB_ORIGIN');
      if (production && !allowedOrigin)
        throw new RpcFault(503, -32000, 'RPC origin policy is not configured.');
      if (
        request.headers.origin &&
        !(
          allowedOrigin
            ? [allowedOrigin]
            : ['http://localhost:3001', 'http://127.0.0.1:3001']
        ).includes(request.headers.origin)
      )
        throw new RpcFault(403, -32003, 'RPC origin is not allowed.');
      const endpoint = rpcEndpoint(
        this.config.get<string>('CYBERCHAIN_RPC_URL'),
        production,
      );
      const writes = calls.filter((c) => c.method === 'eth_sendRawTransaction');
      let wallet: string | undefined;
      if (writes.length || request.headers.authorization) {
        try {
          wallet = this.auth.user(request).toLowerCase();
        } catch {
          throw new RpcFault(
            401,
            -32001,
            'A valid wallet session is required.',
          );
        }
      }
      // Reject the entire batch before forwarding any call if one authorization fails.
      await consumeRpcBudget(
        this.postgres.database,
        wallet,
        calls.length - writes.length,
        writes.length,
      );
      for (const call of writes)
        await this.authorizeVote(call.params[0], wallet!);
      const results = [];
      let status = 200;
      for (const call of calls) {
        try {
          results.push(await this.forward(endpoint, call));
        } catch (error: unknown) {
          const fault =
            error instanceof RpcFault
              ? error
              : new RpcFault(502, -32000, 'RPC upstream is unavailable.');
          status = fault.status;
          results.push({
            jsonrpc: '2.0',
            id: call.id,
            error: { code: fault.code, message: fault.message },
          });
        }
      }
      return reply
        .code(Array.isArray(body) ? 200 : status)
        .header('Cache-Control', 'no-store')
        .send(Array.isArray(body) ? results : results[0]);
    } catch (error: unknown) {
      const fault =
        error instanceof RpcFault
          ? error
          : new RpcFault(503, -32000, 'RPC service is unavailable.');
      const batch = Array.isArray(body) && body.length > 0 && body.length <= 10;
      const candidates: unknown[] = batch ? body : [body];
      const ids = candidates.map((value) => {
        const id: unknown =
          value && typeof value === 'object'
            ? (value as Record<string, unknown>).id
            : null;
        return (typeof id === 'string' && id.length <= 64) ||
          (typeof id === 'number' && Number.isSafeInteger(id))
          ? id
          : null;
      });
      const errors = ids.map((id) => ({
        jsonrpc: '2.0',
        id,
        error: { code: fault.code, message: fault.message },
      }));
      if (fault.status === 429) reply.header('Retry-After', '60');
      return reply
        .code(fault.status)
        .header('Cache-Control', 'no-store')
        .send(batch ? errors : errors[0]);
    }
  }

  private async authorizeVote(raw: string, wallet: string) {
    let proposalId: string, option: number;
    const chain = this.config.get<string>('CYBERCHAIN_CHAIN_ID');
    const contract = this.config.get<string>('GOVERNANCE_CONTRACT_ADDRESS');
    if (
      !chain ||
      !/^\d+$/.test(chain) ||
      !contract ||
      !/^0x[0-9a-fA-F]{40}$/.test(contract)
    )
      throw new RpcFault(
        503,
        -32000,
        'Governance submission is not configured.',
      );
    try {
      const common = Common.custom(
        { chainId: BigInt(chain), networkId: BigInt(chain) },
        { hardfork: 'london' },
      );
      const tx = TransactionFactory.fromSerializedData(
        Buffer.from(raw.slice(2), 'hex'),
        { common },
      );
      const hash =
        tx instanceof LegacyTransaction
          ? LegacyTransaction.fromTxData(
              {
                nonce: tx.nonce,
                gasPrice: tx.gasPrice,
                gasLimit: tx.gasLimit,
                to: tx.to,
                value: tx.value,
                data: tx.data,
              },
              { common },
            ).getHashedMessageToSign()
          : tx.getMessageToVerifySignature();
      if (
        !tx.signature ||
        tx.signature.getSenderAddress(hash).toString().toLowerCase() !==
          wallet ||
        tx.common.chainId() !== BigInt(chain) ||
        tx.value !== 0n ||
        tx.to?.toString().toLowerCase() !== contract.toLowerCase() ||
        tx.data.length !== 68
      )
        throw new Error();
      const decoded = votes.parseTransaction({
        data: '0x' + Buffer.from(tx.data).toString('hex'),
      });
      if (!decoded || decoded.name !== 'vote') throw new Error();
      proposalId = String(decoded.args[0]);
      option = Number(decoded.args[1]);
    } catch {
      throw new RpcFault(
        403,
        -32003,
        'Transaction is not an authorized governance vote.',
      );
    }
    const proposal = await this.postgres.database
      .selectFrom('proposals')
      .select(['id', 'starts_at', 'ends_at', 'status'])
      .where('chain_id', '=', chain)
      .where('contract_address', '=', contract.toLowerCase())
      .where('on_chain_id', '=', proposalId)
      .executeTakeFirst();
    if (
      !proposal ||
      !['ACTIVE', 'PENDING'].includes(proposal.status) ||
      new Date(proposal.starts_at).getTime() > Date.now() ||
      new Date(proposal.ends_at).getTime() <= Date.now()
    )
      throw new RpcFault(
        403,
        -32003,
        'Voting is not available for this proposal.',
      );
    const member = await this.postgres.database
      .selectFrom('proposal_assignments')
      .select('proposal_id')
      .where('proposal_id', '=', proposal.id)
      .where('member_address', '=', wallet)
      .where('assigned', '=', true)
      .executeTakeFirst();
    const choice = await this.postgres.database
      .selectFrom('proposal_options')
      .select('id')
      .where('proposal_id', '=', proposal.id)
      .where('option_index', '=', option)
      .executeTakeFirst();
    const voted = await this.postgres.database
      .selectFrom('votes')
      .select('id')
      .where('proposal_id', '=', proposal.id)
      .where('voter_address', '=', wallet)
      .executeTakeFirst();
    if (!member || !choice || voted)
      throw new RpcFault(
        403,
        -32003,
        'Wallet is not authorized for this vote.',
      );
  }

  private async forward(endpoint: URL, call: RpcCall) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(call),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      let text = '',
        size = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1_048_576) throw new Error();
          text += decoder.decode(chunk.value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const result = JSON.parse(text + decoder.decode()) as {
        jsonrpc?: string;
        id?: unknown;
        result?: unknown;
        error?: { code?: unknown };
      };
      if (result.jsonrpc !== '2.0' || result.id !== call.id) throw new Error();
      if (result.error)
        return {
          jsonrpc: '2.0',
          id: call.id,
          error: {
            code: Number.isInteger(result.error.code)
              ? result.error.code
              : -32000,
            message: 'Upstream RPC rejected the request.',
          },
        };
      if (!Object.hasOwn(result, 'result')) throw new Error();
      return { jsonrpc: '2.0', id: call.id, result: result.result };
    } catch (error: unknown) {
      const timeout =
        error !== null &&
        typeof error === 'object' &&
        'name' in error &&
        typeof error.name === 'string' &&
        ['TimeoutError', 'AbortError'].includes(error.name);
      throw new RpcFault(
        timeout ? 504 : 502,
        -32000,
        timeout ? 'RPC upstream timed out.' : 'RPC upstream is unavailable.',
      );
    }
  }
}
