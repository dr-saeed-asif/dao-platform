import { ConfigService } from '@nestjs/config';
import { Wallet } from 'ethers';
import { AssistantAuthService } from '../assistant-auth.service';
import { AssistantController } from '../assistant.controller';

describe('Assistant authentication and secure proxy', () => {
  const config = new ConfigService({
    JWT_SECRET: 'test-session-key-at-least-32-characters',
    DAO_ADMIN_ADDRESS: '0x0000000000000000000000000000000000000001',
    AI_SERVER_URL: 'http://127.0.0.1:8001',
    AI_SERVER_TOKEN: 'operator-secret-kept-on-server',
  });
  const wallet = Wallet.createRandom();
  let auth: AssistantAuthService;
  const originalFetch = global.fetch;
  const proposal = {
    id: 'proposal-1',
    dao_id: 'dao-1',
    creator_address: wallet.address.toLowerCase(),
  };
  let db: any;
  let controller: AssistantController;
  let req: any;
  beforeEach(async () => {
    auth = new AssistantAuthService(config);
    const c = auth.challenge(wallet.address);
    const session = auth.login(c.nonce, await wallet.signMessage(c.message));
    req = { headers: { authorization: `Bearer ${session.token}` } };
    db = {
      selectFrom: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn().mockResolvedValue(proposal),
    };
    controller = new AssistantController({ database: db } as any, config, auth);
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });
  it('requires a real signature and rejects replay', async () => {
    const c = auth.challenge(wallet.address);
    const signature = await wallet.signMessage(c.message);
    expect(auth.login(c.nonce, signature).address).toBe(
      wallet.address.toLowerCase(),
    );
    expect(() => auth.login(c.nonce, signature)).toThrow('expired');
    const wrong = auth.challenge(wallet.address);
    expect(() => auth.login(wrong.nonce, 'invalid')).toThrow('Invalid');
  });
  it('rejects expired sessions, invalid tokens, and forged address headers', async () => {
    expect(() =>
      auth.user({ headers: { 'x-wallet-address': wallet.address } } as any),
    ).toThrow('Sign in');
    expect(() =>
      auth.user({
        headers: { authorization: 'Bearer forged.' + 'A'.repeat(43) },
      } as any),
    ).toThrow('Invalid');
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
    expect(() => auth.user(req)).toThrow('expired');
  });
  it('rejects expired challenges and a different signer', async () => {
    const c = auth.challenge(wallet.address);
    const signature = await Wallet.createRandom().signMessage(c.message);
    expect(() => auth.login(c.nonce, signature)).toThrow('does not match');
    const expired = auth.challenge(wallet.address);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 121_000);
    expect(() => auth.login(expired.nonce, signature)).toThrow('expired');
  });
  it('derives scope and user upstream; never accepts client permission claims', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [], status: 'completed' })),
      );
    await controller.ask(
      { proposalId: proposal.id, question: ['Question?'] },
      req,
    );
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:8001/rag/agents/ask');
    expect(JSON.parse(options.body)).toMatchObject({
      dao_id: 'dao-1',
      proposal_id: 'proposal-1',
      concurrency: 1,
    });
    expect(options.headers).toMatchObject({
      'X-DAO-User': wallet.address.toLowerCase(),
      Authorization: 'Bearer operator-secret-kept-on-server',
    });
  });
  it('blocks unassigned wallets and missing proposals before invoking AI', async () => {
    global.fetch = jest.fn();
    db.executeTakeFirst
      .mockResolvedValueOnce({ ...proposal, creator_address: 'other' })
      .mockResolvedValueOnce(undefined);
    await expect(
      controller.ask({ proposalId: proposal.id, question: ['Question?'] }, req),
    ).rejects.toThrow('not authorized');
    expect(global.fetch).not.toHaveBeenCalled();
    db.executeTakeFirst.mockResolvedValueOnce(undefined);
    await expect(
      controller.ask({ proposalId: 'missing', question: ['Question?'] }, req),
    ).rejects.toThrow('no longer exists');
  });
  it('accepts current assigned members and revalidates every request', async () => {
    db.executeTakeFirst
      .mockResolvedValueOnce({ ...proposal, creator_address: 'other' })
      .mockResolvedValueOnce({ proposal_id: proposal.id });
    global.fetch = jest.fn().mockResolvedValue(new Response('[]'));
    await expect(controller.list(proposal.id, req)).resolves.toEqual([]);
    expect(db.where).toHaveBeenCalledWith('assigned', '=', true);
  });
  it('blocks conversations in a different proposal', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ dao_id: 'dao-1', proposal_id: 'private-proposal' }),
        ),
      );
    await expect(
      controller.ask(
        {
          proposalId: proposal.id,
          conversation_id: 'other',
          question: ['Question?'],
        },
        req,
      ),
    ).rejects.toThrow('another proposal');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 422, 500])(
    'maps upstream HTTP %s without exposing upstream secrets',
    async (status) => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(new Response('private upstream detail', { status }));
      await expect(
        controller.ask(
          { proposalId: proposal.id, question: ['Question?'] },
          req,
        ),
      ).rejects.toThrow(/credentials|denied|not found|rejected|failed/);
    },
  );
  it('maps network timeouts', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException('deadline', 'TimeoutError'));
    await expect(
      controller.ask({ proposalId: proposal.id, question: ['Question?'] }, req),
    ).rejects.toThrow('timed out');
  });
});
