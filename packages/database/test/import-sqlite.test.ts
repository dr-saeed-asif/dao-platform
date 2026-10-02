import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createPostgresDatabase, migratePostgresToLatest, SqliteDatabase, PostgresGovernanceEventRepository } from '../src/index.js';

const execute = promisify(execFile);
test('SQLite CLI importer is read-only, transactional, repeatable, and reconciles canonical votes', { skip: !process.env.POSTGRES_URL }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dao-import-'));
  const filename = join(directory, 'source.sqlite');
  const source = new SqliteDatabase(`file:${filename}`, directory);
  const target = createPostgresDatabase(process.env.POSTGRES_URL!);
  const suffix = `${Date.now()}${process.pid}`;
  const proposalId = `import-${suffix}`;
  const onChainId = suffix;
  const chainId = '1212';
  const contractAddress = '0x51b43885899bd0301c2beea89addc9d876145d21';
  const address = `0x${'ab'.repeat(20)}`;
  const hash = `0x${suffix.padStart(64, '0')}`;
  const evidenceId = `event:${chainId}:${contractAddress}:${hash}:0`;
  const now = '2026-10-02T00:00:00.000Z';
  const report = join(directory, 'report.jsonl');
  try {
    await source.migrateToLatest();
    await source.db.insertInto('proposals').values({ id: proposalId, dao_id: 'test', idempotency_key: proposalId, on_chain_id: onChainId, creator_address: address, title: 'Import fixture', purpose: 'Migration', description: 'Verify importer', proposal_type: 'STANDARD', status: 'PENDING_ONCHAIN', starts_at: now, ends_at: '2026-10-03T00:00:00.000Z', metadata_json: '{}', created_at: now, updated_at: now }).execute();
    await source.db.insertInto('proposal_options').values([{ proposal_id: proposalId, option_index: 0, label: 'Yes' }, { proposal_id: proposalId, option_index: 1, label: 'No' }]).execute();
    await source.db.insertInto('votes').values({ proposal_id: proposalId, on_chain_proposal_id: onChainId, voter_address: address, option_index: 0, transaction_hash: hash, block_number: '1', block_hash: hash, gas_used: '21000', confirmed_at: now }).execute();
    await source.destroy();
    const originalHash = createHash('sha256').update(await readFile(filename)).digest('hex');
    await migratePostgresToLatest(target);
    await new PostgresGovernanceEventRepository(target).saveGovernanceEvent({ evidenceId, chainId, contractAddress, eventName: 'VoteCast', transactionHash: hash, transactionIndex: 0, logIndex: 0, blockNumber: '2', blockHash: hash, blockTimestamp: String(Date.parse(now) / 1000), transactionSender: address, eventArgs: { proposalId: onChainId, voter: address, optionIndex: '1' }, ingestionTimestamp: now });
    const cli = resolve('dist/scripts/import-sqlite.js');
    const env = { ...process.env, CYBERCHAIN_CHAIN_ID: chainId, GOVERNANCE_CONTRACT_ADDRESS: contractAddress };
    await execute(process.execPath, [cli, '--sqlite', filename, '--report', report, '--dry-run'], { env });
    assert.equal(await target.selectFrom('proposals').select('id').where('id', '=', proposalId).executeTakeFirst(), undefined);
    await execute(process.execPath, [cli, `--sqlite=${filename}`, `--report=${report}`], { env });
    assert.equal((await target.selectFrom('proposals').select('status').where('id', '=', proposalId).executeTakeFirstOrThrow()).status, 'PENDING');
    assert.equal((await target.selectFrom('votes').select('option_index').where('proposal_id', '=', proposalId).executeTakeFirstOrThrow()).option_index, 1);
    await execute(process.execPath, [cli, '--sqlite', filename, '--report', report], { env });
    const summary = JSON.parse((await readFile(report, 'utf8')).trim().split('\n').at(-1)!);
    assert.equal(summary.inserted, 0);
    assert.equal(summary.unchanged, 4);
    assert.equal(summary.validationPassed, true);
    assert.equal(createHash('sha256').update(await readFile(filename)).digest('hex'), originalHash);
  } finally {
    await source.destroy().catch(() => undefined);
    await target.deleteFrom('proposals').where('id', '=', proposalId).execute();
    await target.deleteFrom('governance_events').where('evidence_id', '=', evidenceId).execute();
    await target.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});
