'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const db = require('@dao-platform/database');
const {SyncGovernanceUseCase} = require('@dao-platform/application');
const root = path.resolve(__dirname,'../../..');
const run = path.resolve(process.argv[2]);
const origin = JSON.parse(fs.readFileSync(path.join(root,'research_evaluation/experiment_1_m4/run-01/preflight.json')));
const container = 'cyberdao-recovery-m4-01';
const docker = (...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const port = /^127\.0\.0\.1:(\d+)$/.exec(docker('port',container,'5432/tcp'))?.[1];
assert(port);
const password = docker('exec',container,'printenv','POSTGRES_PASSWORD');
const url = 'postgres://postgres:'+encodeURIComponent(password)+'@127.0.0.1:'+port+'/';
const events = JSON.parse(fs.readFileSync(path.join(root,'research_evaluation/recovery_m4/run-01/gateway-events.jsonl'),'utf8').trim()).events;
const start = 15463875n;
const eventStart = start+1000n;
const pin = eventStart+999n;
const results = [];
async function open(name) {
  docker('exec',container,'createdb','-U','postgres',name);
  const database = db.createPostgresDatabase(url+name);
  await db.migratePostgresToLatest(database);
  return database;
}
function make(database, read) {
  const d=new db.PostgresOperationalDatabase(database);
  return new SyncGovernanceUseCase(new db.PostgresProposalRepository(d,origin.chain_id,origin.contract),
    new db.PostgresAssignmentRepository(d),new db.PostgresVoteRepository(d),
    new db.PostgresChainTransactionRepository(d,origin.chain_id,origin.contract),
    new db.PostgresSyncStateRepository(d,origin.chain_id,origin.contract,'v1'),
    {latestBlockNumber:async()=>pin,findGovernanceEvents:read},
    new db.PostgresGovernanceEventRepository(database),d,start,1000n);
}
async function measure(db) {
  const counts = await Promise.all(['proposals','proposal_assignments','votes','governance_events','chain_transactions']
    .map(async table=>[table,Number((await db.selectFrom(table).select(({fn})=>fn.countAll().as('n')).executeTakeFirst()).n)]));
  const checkpoint = await db.selectFrom('indexer_checkpoints').select('processed_block_number')
    .where('indexer_name','=','governance-full').where('indexer_version','=','v1').executeTakeFirst();
  return {counts:Object.fromEntries(counts),checkpoint:checkpoint?.processed_block_number??null};
}
async function main() {
  const database = await open('m6_postfix_reliability_retry');
  try {
    const ranges=[];
    let interrupted=true;
    const sync=make(database,async from=>{
      ranges.push(String(from));
      if(from===eventStart && interrupted) throw Object.assign(new Error('Injected timeout'),{code:'ETIMEDOUT'});
      return from===eventStart?events:[];
    });
    await assert.rejects(sync.execute(true),{code:'ETIMEDOUT'});
    const partial=await measure(database);
    assert.equal(partial.checkpoint,String(eventStart-1n));
    assert.equal(partial.counts.proposals,0);
    results.push({case:'injected_rpc_timeout_and_partial_indexing',observed:partial,expected:'reject and retain checkpoint at completed range',passed:true});
    interrupted=false;
    await sync.execute(false);
    const repaired=await measure(database);
    assert.equal(ranges.at(-1),String(eventStart));
    assert.equal(repaired.checkpoint,String(pin));
    assert.equal(repaired.counts.proposals,1);
    assert.equal(repaired.counts.proposal_assignments,1);
    results.push({case:'resume_from_stale_checkpoint',observed:repaired,ranges,passed:true});
    await make(database,async from=>from===eventStart?[...events,...events]:[]).execute(true);
    const duplicate=await measure(database);
    assert.deepEqual(duplicate,repaired);
    results.push({case:'duplicate_event_delivery',observed:duplicate,passed:true});
  } finally { await database.destroy(); }
  const missing = await open('m6_postfix_reliability_missing');
  try {
    const scan = await make(missing,async from=>from===eventStart?events.filter(e=>e.kind!=='MEMBER_ASSIGNED'):[]).execute(true);
    const result=await measure(missing);
    assert.equal(result.checkpoint,String(pin));
    assert.equal(result.counts.proposal_assignments,0);
    assert.equal(result.counts.proposals,1);
    assert.equal(scan.coverage,'scan_progress');
    results.push({case:'silent_missing_rpc_event',observed:result,
      expected_assignment_count:1,detected_by_recovery:false,coverage:scan.coverage,
      finding:'Checkpoint advanced despite an omitted successful assignment. Recovery cannot establish completeness from a successful response alone.',
      observation_matches_fixture:true});
  } finally { await missing.destroy(); }
  fs.writeFileSync(path.join(run,'reliability-fixtures.json'),JSON.stringify({source:'Two real gateway event envelopes replayed with controlled inputs; no fixture network access',results},null,2),{flag:'wx'});
  console.log('Reliability fixture observations:',results.length);
}
main().catch(e=>{console.error(e.name,e.code??'',String(e.stack).split('\n').slice(1,4));process.exitCode=1;});
