import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Common } from '@ethereumjs/common';
import { Address } from '@ethereumjs/util';
import { LegacyTransaction, type SignKey } from '@cyberchain/tx';
import { privateKeyToMixedAddress } from '@cyberchain/smart-contract-wrapper';
import { Interface } from 'ethers';
import {
  AssistantAuthService,
  NATIVE_AUTH_CHAIN_ID,
} from '../ai/assistant-auth.service';
import { PostgresService } from '../database/postgres.service';
import { RpcController } from './rpc.controller';
import { consumeRpcBudget } from './rpc-budget';
import { RpcFault } from './rpc-policy';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { configureApp } from '../configure-app';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa';

jest.mock('./rpc-budget', () => ({ consumeRpcBudget: jest.fn() }));
const ec: SignKey = { type: 'ec-dsa', key: new Uint8Array(32).fill(8) };
const complement = '0x' + '11'.repeat(20);
const wallet = privateKeyToMixedAddress(ec, complement);
const contract = '0x' + '22'.repeat(20);
const abi = new Interface(['function vote(uint256,uint16)']);
const read = {
  jsonrpc: '2.0',
  id: 'read-1',
  method: 'eth_chainId',
  params: [],
};
function transaction(
  chain = 1212,
  to = contract,
  value = 0n,
  data = abi.encodeFunctionData('vote', [7, 0]),
  key: SignKey = ec,
) {
  const common = Common.custom(
    { chainId: chain, networkId: chain },
    { hardfork: 'london' },
  );
  return (
    '0x' +
    Buffer.from(
      LegacyTransaction.fromTxData(
        {
          nonce: 0n,
          gasPrice: chain === NATIVE_AUTH_CHAIN_ID ? 0n : 1n,
          gasLimit: 6_000_000n,
          to: Address.fromString(to),
          value,
          data: Buffer.from(data.slice(2), 'hex'),
        },
        { common },
      )
        .sign(key, Address.fromString(complement))
        .serialize(),
    ).toString('hex')
  );
}

describe('C6 RPC relay', () => {
  const oldFetch = global.fetch;
  let controller: RpcController;
  let session: string;
  let config: ConfigService;
  let records: Record<string, unknown>;
  let db: PostgresService;
  const budget = jest.mocked(consumeRpcBudget);
  beforeEach(() => {
    config = new ConfigService({
      NODE_ENV: 'test',
      CYBERCHAIN_RPC_URL: 'https://rpc.invalid/?key=fixture-private',
      CYBERCHAIN_CHAIN_ID: '1212',
      GOVERNANCE_CONTRACT_ADDRESS: contract,
      JWT_SECRET: 'fixture-rpc-session-key-with-more-than-32-characters',
    });
    const auth = new AssistantAuthService(config);
    const challenge = auth.challenge(wallet, 'cyberchain');
    session = auth.login(
      challenge.nonce,
      undefined,
      transaction(
        NATIVE_AUTH_CHAIN_ID,
        wallet,
        0n,
        '0x' + Buffer.from(challenge.message).toString('hex'),
      ),
    ).token;
    records = {
      proposals: {
        id: 'p',
        status: 'ACTIVE',
        starts_at: new Date(Date.now() - 1000),
        ends_at: new Date(Date.now() + 60_000),
      },
      proposal_assignments: { proposal_id: 'p' },
      proposal_options: { id: 1 },
      votes: undefined,
    };
    db = {
      database: {
        selectFrom: (name: string) => {
          const query = {
            select: () => query,
            where: () => query,
            executeTakeFirst: () => Promise.resolve(records[name]),
          };
          return query;
        },
      },
    } as unknown as PostgresService;
    controller = new RpcController(config, auth, db);
    budget.mockReset();
    budget.mockResolvedValue(undefined);
    global.fetch = jest.fn((_url, init) => {
      if (typeof init?.body !== 'string') throw new Error('Expected RPC JSON');
      const body = JSON.parse(init.body) as { id: unknown };
      return Promise.resolve(
        Response.json({ jsonrpc: '2.0', id: body.id, result: '0x4bc' }),
      );
    });
  });
  afterEach(() => {
    global.fetch = oldFetch;
    jest.restoreAllMocks();
  });
  async function relay(body: unknown, token?: string, origin?: string) {
    const state: {
      status: number;
      headers: Record<string, string>;
      body?: unknown;
    } = { status: 200, headers: {} };
    const reply = {
      code(status: number) {
        state.status = status;
        return reply;
      },
      header(key: string, value: string) {
        state.headers[key] = value;
        return reply;
      },
      send(value: unknown) {
        state.body = value;
        return reply;
      },
    };
    await controller.relay(
      body,
      {
        headers: {
          ...(token ? { authorization: 'Bearer ' + token } : {}),
          ...(origin ? { origin } : {}),
        },
      } as FastifyRequest,
      reply as unknown as FastifyReply,
    );
    return state;
  }
  const submit = (raw = '0x01') => ({
    jsonrpc: '2.0',
    id: 7,
    method: 'eth_sendRawTransaction',
    params: [raw],
  });

  it('rejects anonymous submissions without contacting the blockchain', async () => {
    expect((await relay(submit())).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('submits only a signed authorized vote from the session wallet', async () => {
    const result = await relay(submit(transaction()), session);
    expect(result.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(budget).toHaveBeenCalledWith(
      db.database,
      wallet.toLowerCase(),
      0,
      1,
    );
  });
  it.each(['forged', 'expired'])('rejects %s sessions', async (kind) => {
    if (kind === 'expired')
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
    expect(
      (await relay(submit(), kind === 'forged' ? 'forged' : session)).status,
    ).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('permits public reads and preserves their IDs', async () => {
    expect((await relay(read)).body).toEqual({
      jsonrpc: '2.0',
      id: 'read-1',
      result: '0x4bc',
    });
  });
  it('preserves ML-DSA wallet submission support', async () => {
    const pair = ml_dsa44.keygen(new Uint8Array(32).fill(7));
    const key: SignKey = {
      type: 'ml-dsa',
      spec: 44,
      publicKey: pair.publicKey,
      secretKey: pair.secretKey,
    };
    const owner = privateKeyToMixedAddress(key, complement);
    const auth = new AssistantAuthService(config);
    const challenge = auth.challenge(owner, 'cyberchain');
    const signed = transaction(
      NATIVE_AUTH_CHAIN_ID,
      owner,
      0n,
      '0x' + Buffer.from(challenge.message).toString('hex'),
      key,
    );
    const proof = auth.login(challenge.nonce, undefined, signed);
    expect(
      (
        await relay(
          submit(
            transaction(
              1212,
              contract,
              0n,
              abi.encodeFunctionData('vote', [7, 0]),
              key,
            ),
          ),
          proof.token,
        )
      ).status,
    ).toBe(200);
  });
  it('enforces body limits and authentication through the registered Fastify route', async () => {
    const module = await Test.createTestingModule({
      controllers: [RpcController],
      providers: [
        { provide: ConfigService, useValue: config },
        {
          provide: AssistantAuthService,
          useValue: new AssistantAuthService(config),
        },
        {
          provide: PostgresService,
          useValue: db,
        },
      ],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureApp(app);
    try {
      await app.init();
      const server = app.getHttpAdapter().getInstance();
      await server.ready();
      const send = (payload: string) =>
        server.inject({
          method: 'POST',
          url: '/v1/cyberchain/rpc',
          headers: { 'content-type': 'application/json' },
          payload,
        });
      expect((await send('{')).statusCode).toBe(400);
      expect(
        (await send(JSON.stringify({ ...read, padding: 'x'.repeat(65_536) })))
          .statusCode,
      ).toBe(413);
      expect((await send(JSON.stringify(submit()))).statusCode).toBe(401);
      expect((await send(JSON.stringify(read))).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
  it('does not treat a forged read session as anonymous', async () => {
    expect((await relay(read, 'forged')).status).toBe(401);
  });
  it.each([
    'debug_traceTransaction',
    'eth_sendTransaction',
    'personal_unlockAccount',
    'eth_call',
  ])('rejects %s', async (method) => {
    expect((await relay({ ...read, method })).status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    [],
    { ...read, jsonrpc: '1.0' },
    { ...read, params: {} },
    { ...read, id: {} },
    Array.from({ length: 11 }, () => read),
  ])('rejects invalid request structure %#', async (body) => {
    expect((await relay(body)).status).toBe(400);
  });
  it('rejects oversized bodies', async () => {
    expect((await relay({ ...read, padding: 'x'.repeat(65536) })).status).toBe(
      413,
    );
  });
  it('rejects mixed forbidden batches atomically with client IDs', async () => {
    const result = await relay([
      read,
      { ...read, id: 2, method: 'personal_unlockAccount' },
    ]);
    expect(result.status).toBe(400);
    expect(result.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'read-1' }),
        expect.objectContaining({ id: 2 }),
      ]),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('charges every batch read', async () => {
    await relay([read, { ...read, id: 2 }]);
    expect(budget).toHaveBeenCalledWith(db.database, undefined, 2, 0);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('returns 429 with retry guidance before forwarding', async () => {
    budget.mockRejectedValue(
      new RpcFault(429, -32005, 'RPC rate limit exceeded.'),
    );
    const result = await relay(read);
    expect(result.status).toBe(429);
    expect(result.headers['Retry-After']).toBe('60');
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('fails closed if shared storage fails', async () => {
    budget.mockRejectedValue(
      new RpcFault(503, -32000, 'RPC rate control is unavailable.'),
    );
    expect((await relay(read)).status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    'http://rpc.invalid',
    'ftp://rpc.invalid',
    'https://user:pass@rpc.invalid',
  ])('rejects unsafe production endpoint %#', async (endpoint) => {
    config.set('NODE_ENV', 'production');
    config.set('RPC_WEB_ORIGIN', 'https://dao.invalid');
    config.set('CYBERCHAIN_RPC_URL', endpoint);
    expect((await relay(read)).status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests', async () => {
    expect(
      (await relay(read, undefined, 'https://attacker.invalid')).status,
    ).toBe(403);
  });
  it.each(['network', 'timeout', 'redirect'])(
    'handles upstream %s safely',
    async (kind) => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(
          kind === 'timeout'
            ? new DOMException('fixture-private', 'TimeoutError')
            : new Error('fixture-private'),
        );
      const result = await relay(read);
      expect(result.status).toBe(kind === 'timeout' ? 504 : 502);
      expect(JSON.stringify(result.body)).not.toContain('fixture-private');
    },
  );
  it('strips upstream error details', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({
        jsonrpc: '2.0',
        id: read.id,
        error: {
          code: -32000,
          message: 'fixture-private',
          data: 'fixture-private',
        },
      }),
    );
    expect(JSON.stringify((await relay(read)).body)).not.toContain(
      'fixture-private',
    );
  });
  it('aborts a stalled upstream within its time budget', async () => {
    jest.useFakeTimers();
    jest.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    global.fetch = jest.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Timed out', 'TimeoutError')),
            { once: true },
          );
        }),
    );
    try {
      const response = relay(read);
      await jest.advanceTimersByTimeAsync(10_001);
      expect((await response).status).toBe(504);
    } finally {
      jest.useRealTimers();
    }
  });
  it.each(['member', 'option', 'already-voted', 'closed'])(
    'rejects unauthorized %s vote',
    async (kind) => {
      if (kind === 'member') records.proposal_assignments = undefined;
      if (kind === 'option') records.proposal_options = undefined;
      if (kind === 'already-voted') records.votes = { id: 1 };
      if (kind === 'closed')
        records.proposals = { id: 'p', status: 'FINALIZED' };
      expect((await relay(submit(transaction()), session)).status).toBe(403);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    transaction(1213),
    transaction(1212, complement),
    transaction(1212, contract, 1n),
    transaction(1212, contract, 0n, '0x1234'),
  ])('rejects unauthorized transaction payload %#', async (raw) => {
    expect((await relay(submit(raw), session)).status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
