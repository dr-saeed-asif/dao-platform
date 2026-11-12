import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/cyberchain/rpc/route.ts';

const original = globalThis.fetch;
const environment = { ...process.env };
let calls: RequestInit[];
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DAO_API_ORIGIN = 'http://127.0.0.1:3000';
  calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:3000/v1/cyberchain/rpc');
    calls.push(init ?? {});
    return Response.json({ jsonrpc: '2.0', id: 1, result: '0x4bc' });
  };
});
afterEach(() => { globalThis.fetch = original; process.env = { ...environment }; });
function request(body: string, headers: Record<string,string> = {}) {
  return new Request('http://localhost:3001/api/cyberchain/rpc', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
}
test('forwards only wallet authorization and origin to the fixed Nest gateway', async () => {
  const response = await POST(request('{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
    { Authorization: 'Bearer fixture', Origin: 'http://localhost:3001', Cookie: 'ignored', 'X-DAO-User': 'ignored' }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].headers, { 'Content-Type': 'application/json', Authorization: 'Bearer fixture', Origin: 'http://localhost:3001' });
});
test('malformed JSON is rejected without gateway traffic', async () => {
  assert.equal((await POST(request('{'))).status, 400); assert.equal(calls.length, 0);
});
test('oversized streamed body without content length is rejected', async () => {
  assert.equal((await POST(request('x'.repeat(65537)))).status, 413); assert.equal(calls.length, 0);
});
test('oversized declared body is rejected', async () => {
  assert.equal((await POST(request('{}', { 'Content-Length': '999999' }))).status, 413);
});
test('cross-origin requests are rejected', async () => {
  assert.equal((await POST(request('{}', { Origin: 'https://attacker.invalid' }))).status, 403);
});
test('production requires an explicit HTTPS gateway', async () => {
  process.env.NODE_ENV = 'production'; delete process.env.DAO_API_ORIGIN;
  assert.equal((await POST(request('{}'))).status, 503);
  process.env.DAO_API_ORIGIN = 'http://api.invalid';
  assert.equal((await POST(request('{}'))).status, 503);
});
test('upstream connection failures disclose no configuration', async () => {
  globalThis.fetch = async () => { throw Error('private-configuration'); };
  const response = await POST(request('{}'));
  assert.equal(response.status, 502); assert.equal((await response.text()).includes('private-configuration'), false);
});
test('429 and Retry-After are preserved', async () => {
  globalThis.fetch = async () => Response.json({ error: { message: 'RPC rate limit exceeded.' } }, { status: 429, headers: { 'Retry-After': '60' } });
  const response = await POST(request('{}')); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
});
