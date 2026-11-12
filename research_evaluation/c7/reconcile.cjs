// Read-only, explicit opt-in evaluation. Does not start the production application.
'use strict';
require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const original = path.join(root, 'research_evaluation/springer/reconciliation_config.json');
const rawOriginal = path.join(root, 'research_evaluation/springer/reconciliation.jsonl');
const source = path.join(root, 'apps/api/src/ai/blockchain-verification.service.ts');
const compiled = path.join(root, 'apps/api/dist/ai/blockchain-verification.service.js');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const roster = JSON.parse(fs.readFileSync(original)).cohort_ids;
if (roster.length !== 39 || new Set(roster).size !== 39) throw new Error('Original roster must contain 39 distinct proposals');
const historical = fs.readFileSync(rawOriginal, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
if (historical.length !== 39 || roster.some(id => !historical.some(r => r.proposal_id === id))) throw new Error('Historical records do not cover the roster');
const flag = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const run = process.argv.includes('--run');
const out = path.resolve(flag('--out') || path.join(__dirname, run ? 'observations' : 'prepared'));
if (fs.existsSync(out)) throw new Error('Output path already exists: choose a new versioned directory');
fs.mkdirSync(out, { recursive: true });
const config = {
  schema_version: 1, created_utc: new Date().toISOString(), executed: false,
  source_commit: git('rev-parse', 'HEAD'), source_sha256: digest(source),
  source_uncommitted: Boolean(git('status', '--porcelain', '--', path.relative(root, source))),
  script_sha256: digest(__filename), original_config_sha256: digest(original), original_raw_sha256: digest(rawOriginal),
  cohort_ids: roster, cohort_n: roster.length,
  pin_policy: 'One explicit C7_PIN_BLOCK for all proposals, or latest minus C7_FINALITY_DEPTH (default 0; no finality guarantee). Record block hash before/after each verification.',
  sql_policy: 'One REPEATABLE READ, READ ONLY transaction for the campaign; contemporaneous SQL is not historical SQL at the chain block.',
  scope: 'New observational follow-up, not a paired rerun of the original temporal database snapshot.',
  historical_pins: historical.map(r => ({ proposal_id: r.proposal_id, block: r.block, block_hash: r.block_hash })),
  statuses: ['verified', 'mismatched', 'unverified', 'unavailable'],
  failure_policy: 'Keep unavailable and thrown exceptions separately; no selective retries or exclusions.',
};
fs.writeFileSync(path.join(out, 'configuration.json'), JSON.stringify(config, null, 2), { flag: 'wx' });
fs.writeFileSync(path.join(out, 'source.patch'), cp.execFileSync('git', ['diff', 'HEAD', '--', path.relative(root, source)], { cwd: root }), { flag: 'wx' });
if (!run) { if (process.argv.includes('--check-build')) { config.compiled_sha256 = validateBuild(); config.compiled_source_match = true; fs.writeFileSync(path.join(out, 'configuration.json'), JSON.stringify(config, null, 2)); } console.log(JSON.stringify({ prepared: roster.length, executed: 0, output: out })); process.exit(0); }
function validateBuild() {
  const compiledText = fs.readFileSync(compiled, 'utf8');
  if (!compiledText.includes('indexer_checkpoint') || !compiledText.includes('DATABASE_STATE_MAP')) throw new Error('Build does not contain C7');
  // Compilation must correspond byte-for-byte to current source, not stale dist.
  const ts = require('typescript');
  const file = ts.readConfigFile(path.join(root, 'apps/api/tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(file.config, ts.sys, path.join(root, 'apps/api')).options;
  parsed.incremental = false;
  const program = ts.createProgram([source], parsed);
  let expected;
  program.emit(program.getSourceFile(source), (name, data) => { if (name.endsWith('blockchain-verification.service.js')) expected = data; });
  if (!expected) throw new Error('Verifier compilation produced no JavaScript');
  if (expected.replace(/\r\n/g, '\n').trim() !== compiledText.replace(/\r\n/g, '\n').trim()) throw new Error('Compiled verifier differs from source; rebuild');
  return digest(compiled);
}
async function main() {
  // Secrets are supplied by the operator; never loaded from research artifacts or printed.
  const required = ['C7_DATABASE_URL', 'CYBERCHAIN_RPC_URL', 'CYBERCHAIN_CHAIN_ID', 'GOVERNANCE_CONTRACT_ADDRESS', 'GOVERNANCE_DEPLOYMENT_BLOCK'];
  if (required.some(name => !process.env[name])) throw new Error('Required evaluation configuration is unavailable');
  config.compiled_sha256 = validateBuild();
  const { ConfigService } = require('@nestjs/config');
  const { sql } = require('kysely');
  const { createPostgresDatabase } = require('@dao-platform/database');
  const { BlockchainVerificationService, DATABASE_STATE_MAP } = require(compiled);
  if (DATABASE_STATE_MAP.FINALIZED !== 'Closed') throw new Error('C7 status map absent');
  const url = new URL(process.env.C7_DATABASE_URL);
  url.searchParams.set('options', '-c default_transaction_read_only=on -c statement_timeout=10000');
  const database = createPostgresDatabase(url.toString());
  const rows = [];
  try {
    await database.transaction().setIsolationLevel('repeatable read').execute(async tx => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      if ((await sql`SHOW transaction_read_only`.execute(tx)).rows[0].transaction_read_only !== 'on') throw new Error('Read-only transaction required');
      const service = new BlockchainVerificationService({ database: tx }, new ConfigService(process.env));
      const rpc = service.rpc.bind(service);
      const depth = BigInt(process.env.C7_FINALITY_DEPTH || '0');
      const pin = process.env.C7_PIN_BLOCK ? BigInt(process.env.C7_PIN_BLOCK) : BigInt(await rpc('eth_blockNumber', [])) - depth;
      if (pin < 0n || depth < 0n) throw new Error('Invalid pin policy');
      const block = '0x' + pin.toString(16);
      const snapshot = await rpc('eth_getBlockByNumber', [block, false]);
      if (!snapshot?.hash || BigInt(snapshot.number) !== pin) throw new Error('Pinned block unavailable');
      config.block_number = pin.toString(); config.block_hash = snapshot.hash;
      config.finality_depth = depth.toString(); config.executed = true;
      config.sql_snapshot = (await sql`SELECT txid_current_snapshot()::text AS snapshot, transaction_timestamp() AS observed_at`.execute(tx)).rows[0];
      // Freeze the exact authorized inputs in this read-only transaction.
      // These are local research evidence, requiring privacy review before publication.
      const proposals = await tx.selectFrom('proposals').selectAll().where('id', 'in', roster).execute();
      if (proposals.length !== 39) throw new Error('Original 39-proposal environment is incomplete');
      const evidence = { proposals,
        votes: await tx.selectFrom('votes').selectAll().where('proposal_id', 'in', roster).execute(),
        assignments: await tx.selectFrom('proposal_assignments').selectAll().where('proposal_id', 'in', roster).execute(),
        checkpoints: await tx.selectFrom('indexer_checkpoints').selectAll().where('chain_id', '=', process.env.CYBERCHAIN_CHAIN_ID).where('contract_address', '=', process.env.GOVERNANCE_CONTRACT_ADDRESS.toLowerCase()).execute(),
      };
      const stringify = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
      fs.writeFileSync(path.join(out, 'sql_evidence.local.json'), stringify(evidence), { flag: 'wx' });
      config.sql_evidence_sha256 = digest(path.join(out, 'sql_evidence.local.json'));
      service.rpc = (method, params) => method === 'eth_blockNumber' ? Promise.resolve(block) : rpc(method, params);
      fs.writeFileSync(path.join(out, 'configuration.json'), stringify(config));
      for (const id of roster) {
        const started = performance.now(); let record;
        try {
          const proposal = proposals.find(p => p.id === id);
          const report = await service.verify(id, proposal.dao_id);
          record = { proposal_id: id, status: report.status, report };
        } catch (error) { record = { proposal_id: id, status: 'failed', error_type: error.name }; }
        record.duration_ms = performance.now() - started;
        fs.appendFileSync(path.join(out, 'responses.jsonl'), stringify(record) + '\n', { flush: true });
        rows.push(record);
      }
    });
  } finally { await database.destroy(); }
  const counts = Object.fromEntries(['verified','mismatched','unverified','unavailable','failed'].map(k => [k, rows.filter(r => r.status === k).length]));
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify({ attempted: rows.length, expected: 39, counts }, null, 2), { flag: 'wx' });
  const csv = ['proposal_id,status,block_number,duration_ms,uncertainty_reasons'];
  for (const row of rows) csv.push([row.proposal_id, row.status, row.report?.block_number || '', row.duration_ms,
    JSON.stringify([...(row.report?.errors || []), ...(row.report?.comparisons || []).filter(c => c.status !== 'verified').map(c => ({ field: c.field, status: c.status, reason: c.reason || 'Observed value disagreement' }))])].map(v => JSON.stringify(String(v))).join(','));
  fs.writeFileSync(path.join(out, 'outcomes.csv'), csv.join('\n') + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ attempted: rows.length, counts, output: out }));
}
main().catch(error => {
  fs.writeFileSync(path.join(out, 'execution_failure.json'), JSON.stringify({ error_type: error.name, executed_records: fs.existsSync(path.join(out, 'responses.jsonl')) ? fs.readFileSync(path.join(out, 'responses.jsonl'), 'utf8').trim().split('\n').length : 0, message: 'Evaluation failed; inspect local configuration privately. No credentials logged.' }, null, 2));
  console.error('Evaluation failed; preserved records and sanitized failure metadata.'); process.exitCode = 1;
});
