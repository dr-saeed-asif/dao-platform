// Disposable PostgreSQL only. No blockchain calls or configured application DSNs.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');
const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { consumeRpcBudget } = require('../../apps/api/src/rpc/rpc-budget.ts');
const migration = require('../../packages/database/src/postgres-migrations/rpc-rate-limits.migration.ts');
const container = 'cyberdao-c6-' + randomBytes(6).toString('hex');
let owner, instanceA, instanceB, started = false;
function docker(...args) { return execFileSync('docker', args, { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function database(port, user, password) {
  return new Kysely({ dialect: new PostgresDialect({ pool: new Pool({ host: '127.0.0.1', port,
    database: 'postgres', user, password, max: 8, connectionTimeoutMillis: 3000 }) }) });
}
before(async () => {
  const password = randomBytes(24).toString('hex');
  const previous = process.env.POSTGRES_PASSWORD;
  process.env.POSTGRES_PASSWORD = password;
  try { docker('run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD', '-p', '127.0.0.1::5432', 'postgres:17-alpine'); started = true; }
  finally { if (previous === undefined) delete process.env.POSTGRES_PASSWORD; else process.env.POSTGRES_PASSWORD = previous; }
  const port = Number(docker('port', container, '5432/tcp').split(':').at(-1));
  owner = database(port, 'postgres', password);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { await sql`SELECT 1`.execute(owner); ready = true; break; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(ready, 'disposable database started');
  const runtimePassword = randomBytes(24).toString('hex');
  await sql.raw(`CREATE ROLE cyberdao_dao_runtime LOGIN PASSWORD '${runtimePassword}'`).execute(owner);
  await migration.up(owner);
  instanceA = database(port, 'cyberdao_dao_runtime', runtimePassword);
  instanceB = database(port, 'cyberdao_dao_runtime', runtimePassword);
});
beforeEach(async () => { await sql`DELETE FROM public.rpc_rate_limits`.execute(owner); });
after(async () => {
  await Promise.all([owner, instanceA, instanceB].filter(Boolean).map((db) => db.destroy()));
  if (started) docker('stop', container);
});
test('concurrent submission attempts across two service pools permit exactly ten', async () => {
  const result = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => consumeRpcBudget(i % 2 ? instanceA : instanceB, 'wallet-A', 0, 1)));
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 10);
  assert.equal(result.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 20);
});
test('batch costs count calls and a failed mixed reservation rolls back', async () => {
  await consumeRpcBudget(instanceA, 'wallet-A', 0, 10);
  await assert.rejects(consumeRpcBudget(instanceB, 'wallet-A', 7, 1), { status: 429 });
  const result = await sql`SELECT used FROM public.rpc_rate_limits WHERE kind='read'`.execute(owner);
  assert.equal(result.rows.length, 0);
});
test('anonymous and authenticated read budgets are shared and distinct', async () => {
  await consumeRpcBudget(instanceA, undefined, 120, 0);
  await assert.rejects(consumeRpcBudget(instanceB, undefined, 1, 0), { status: 429 });
  await consumeRpcBudget(instanceB, 'wallet-A', 240, 0);
  await assert.rejects(consumeRpcBudget(instanceA, 'wallet-A', 1, 0), { status: 429 });
});
test('global submission limit cannot be bypassed by changing wallets', async () => {
  for (let i = 0; i < 10; i++) await consumeRpcBudget(instanceA, `wallet-${i}`, 0, 10);
  await assert.rejects(consumeRpcBudget(instanceB, 'new-wallet', 0, 1), { status: 429 });
});
test('missing shared storage fails closed', async () => {
  await migration.down(owner);
  try { await assert.rejects(consumeRpcBudget(instanceA, 'wallet-A', 1, 0), { status: 503 }); }
  finally { await migration.up(owner); }
});
