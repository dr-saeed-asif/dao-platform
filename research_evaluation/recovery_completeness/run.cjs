'use strict';
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {ConfigService} = require('@nestjs/config');
const {sql} = require('kysely');
const db = require('@dao-platform/database');
const {SyncGovernanceUseCase} = require('@dao-platform/application');
const {CyberChainGovernanceGateway} = require('@dao-platform/blockchain-cyberchain');
const {Web3RPCClient} = require('@cyberchain/smart-contract-wrapper');
const root = path.resolve(__dirname,'../..');
const recovery = path.join(root,'research_evaluation/experiment_1_m4/run-01');
const out = path.resolve(process.argv[2]);
const container = 'cyberdao-recovery-m4-01';
const env = require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
const origin = JSON.parse(fs.readFileSync(path.join(recovery,'preflight.json')));
const historical = JSON.parse(fs.readFileSync(path.join(recovery,'configuration.json')));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const stringify = value => JSON.stringify(value,(_,v) => typeof v === 'bigint' ? v.toString() : v);
const write = (file,value) => fs.writeFileSync(path.join(out,file),stringify(value));
const append = (file,value) => fs.appendFileSync(path.join(out,file),stringify(value)+'\n');
const docker = (...args) => execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const source = 'apps/api/src/ai/blockchain-verification.service.ts';
const built = 'apps/api/dist/ai/blockchain-verification.service.js';
const {BlockchainVerificationService} = require(path.join(root,built));
const {GOVERNANCE_INDEXER_VERSION: version} = require(path.join(root,'apps/api/dist/database/governance-indexer-version.js'));
const pin = BigInt(origin.block_number);
const pinHex = '0x'+pin.toString(16);
const from = BigInt(origin.deployment_block);
const range = 1000n;
const rpcClient = Web3RPCClient.getInstance();
const upstream = rpcClient.rpcRequest.bind(rpcClient);
const allowed = new Set(['eth_chainId','eth_getBlockByNumber','eth_getLogs','eth_getTransactionReceipt','eth_call','eth_getTransactionByHash','eth_blockNumber']);
rpcClient.rpcRequest = (method,params,opts) => {
  if (!allowed.has(method)) throw Error('RPC method is outside recovery read allowlist');
  return upstream(method,params,{...opts,timeout:15000});
};
const rpc = (method,params) => rpcClient.rpcRequest(method,params,{rpcURL:env.CYBERCHAIN_RPC_URL});
const checkPin = async () => {
  const block = await rpc('eth_getBlockByNumber',[pinHex,false]);
  if (!block || block.hash !== origin.block_hash || BigInt(block.number) !== pin) throw Error('Original pin changed or unavailable');
};
function snapshot(database) {
  return Promise.all(['proposals','proposal_options','proposal_assignments','votes','governance_events','chain_transactions','indexer_checkpoints']
    .map(async table=>[table,await database.selectFrom(table).selectAll().execute()])).then(Object.fromEntries);
}
function useCase(database,chain,first=from) {
  const d = new db.PostgresOperationalDatabase(database);
  return new SyncGovernanceUseCase(
    new db.PostgresProposalRepository(d,origin.chain_id,origin.contract),
    new db.PostgresAssignmentRepository(d), new db.PostgresVoteRepository(d),
    new db.PostgresChainTransactionRepository(d,origin.chain_id,origin.contract),
    new db.PostgresSyncStateRepository(d,origin.chain_id,origin.contract,version),
    chain,new db.PostgresGovernanceEventRepository(database),d,first,range);
}
async function main() {
  if (!fs.readFileSync(path.join(root,built),'utf8').includes('const maxPages = 5000'))
    throw Error('Compiled verifier lacks the new pagination implementation');
  fs.mkdirSync(out);
  const originalSql = path.join(recovery,'sql_evidence.local.json');
  if (fileHash(originalSql)!==historical.sql_evidence_sha256) throw Error('Original SQL snapshot hash mismatch');
  if (hash(new URL(env.CYBERCHAIN_RPC_URL).href)!==origin.rpc_endpoint_sha256) throw Error('RPC differs from original run');
  if (version !== 'v1') throw Error('Incorrect built indexer scope');
  if (docker('inspect','--format','{{.Config.Image}}',container)!=='pgvector/pgvector:pg16') throw Error('Unexpected container');
  const port = /^127\.0\.0\.1:(\d+)$/.exec(docker('port',container,'5432/tcp'))?.[1];
  if (!port) throw Error('Isolated container must be bound to loopback');
  const password = docker('exec',container,'printenv','POSTGRES_PASSWORD');
  const databaseUrl = 'postgres://postgres:'+encodeURIComponent(password)+'@127.0.0.1:'+port+'/recovery_completeness_v2';
  const database = db.createPostgresDatabase(databaseUrl);
  const config = {started_utc:new Date().toISOString(), pin:pin.toString(), pin_hash:origin.block_hash,
    source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    working_tree:execFileSync('git',['status','--porcelain=v1'],{cwd:root,encoding:'utf8'}),
    chain_id:origin.chain_id, contract:origin.contract, from:from.toString(), range:Number(range),
    indexer_version:version, prefetch_concurrency:8, verification_concurrency:3, rpc_endpoint_sha256:origin.rpc_endpoint_sha256,
    historical_sql_snapshot:historical.sql_snapshot, original_sql_sha256:fileHash(originalSql),
    image_id:docker('inspect','--format','{{.Image}}',container), node:process.version, read_rpc_methods:[...allowed],
    sources:Object.fromEntries([source,built,'apps/api/src/database/governance-indexer-version.ts',
      'packages/application/src/synchronization/sync-governance.use-case.ts','packages/blockchain-cyberchain/src/cyberchain-governance.gateway.ts',
      'packages/database/src/postgres-database.ts',
      'packages/application/dist/src/synchronization/sync-governance.use-case.js',
      'packages/blockchain-cyberchain/dist/src/cyberchain-governance.gateway.js','package-lock.json'].map(file=>[file,fileHash(path.join(root,file))]))};
  write('configuration.json',config);
  fs.writeFileSync(path.join(out,'verifier.patch'),execFileSync('git',['diff','HEAD','--',source],{cwd:root}));
  try {
    const tables = (await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`.execute(database)).rows[0].n;
    if (tables !== 0) throw Error('Recovery database must be fresh');
    await db.migratePostgresToLatest(database);
    config.migrations = await database.selectFrom('kysely_migration').select('name').orderBy('name').execute();
    write('configuration.json',config);
    if (BigInt(await rpc('eth_chainId',[])).toString()!==origin.chain_id) throw Error('Wrong RPC chain');
    await checkPin();
    const gateway = new CyberChainGovernanceGateway({rpcURL:env.CYBERCHAIN_RPC_URL,chainId:origin.chain_id,
      contractAddress:origin.contract,signing:new Proxy({}, {get(){throw Error('Signing disabled')}})});
    const cache = new Map();
    let requests = 0;
    const pending = new Map();
    function fetch(start,end) {
      const key = start.toString();
      if (pending.has(key)) return pending.get(key);
      const job = gateway.findGovernanceEvents(start,end).then(events=>({events}),e=>({error:e}));
      pending.set(key,job);
      return job;
    }
    const sync = useCase(database,{
      latestBlockNumber:async()=>pin,
      async findGovernanceEvents(start,end) {
        for (let i=0n; i<8n && start+i*range<=pin; i++) {
          const a=start+i*range;
          fetch(a,a+range-1n>pin?pin:a+range-1n);
        }
        const result = await fetch(start,end);
        pending.delete(start.toString());
        if (result.error) { append('ranges.jsonl',{from:String(start),to:String(end),error_type:result.error.name}); throw result.error; }
        const events=result.events;
        if(events.length) {
          cache.set(start.toString(),events);
          append('gateway-events.jsonl',{from:String(start),events});
        }
        append('ranges.jsonl',{from:String(start),to:String(end),events:events.length});
        if (++requests%500===0) console.log('Scanned ranges',requests);
        return events;
      }
    });
    const started=performance.now();
    const result=await sync.execute(true);
    const elapsed=performance.now()-started;
    await checkPin();
    const initial=await snapshot(database);
    write('sql-recovered.json',initial);
    write('recovery.json',{...result, wall_ms:elapsed, proposals_discovered:new Set([...cache.values()].flat().filter(e=>e.kind==='PROPOSAL_CREATED').map(e=>e.onChainProposalId)).size,
      counts:Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,v.length])),checkpoints:initial.indexer_checkpoints});
    console.log('Recovered',initial.proposals.length,'proposals');
    const replay = useCase(database,{latestBlockNumber:async()=>pin,findGovernanceEvents:async(start)=>cache.get(String(start))||[]});
    const replayResults = [];
    const keyFields = {proposals:['on_chain_id','status','total_votes','winning_option','tied'],
      proposal_options:['proposal_id','option_index','label'],proposal_assignments:['proposal_id','member_address','assigned'],
      votes:['proposal_id','voter_address','option_index','transaction_hash'],governance_events:['evidence_id'],chain_transactions:['transaction_hash'],
      indexer_checkpoints:['indexer_name','indexer_version','processed_block_number']};
    const projection = rows => Object.fromEntries(Object.entries(rows).map(([table,records])=>[table,records.map(r=>stringify(keyFields[table].map(k=>r[k]))).sort()]));
    for(let i=0;i<2;i++){
      const result=await replay.execute(true);
      replayResults.push({result,stable:stringify(projection(initial))===stringify(projection(await snapshot(database)))});
    }
    const incremental=await replay.execute(false);
    write('replay.json',{input:'Cached live gateway events, all scanned ranges replayed without external requests',replayResults,incremental});
    write('sql-verification-input.json',await snapshot(database));
    const readUrl=new URL(databaseUrl);
    readUrl.searchParams.set('options','-c default_transaction_read_only=on');
    const readDb=db.createPostgresDatabase(readUrl.toString());
    try {
      const verifier=new BlockchainVerificationService({database:readDb},new ConfigService(env));
      verifier.rpc=async(method,params)=>{
        if(method==='eth_blockNumber') return pinHex;
        const reply=await rpc(method,params);
        if(method==='eth_getBlockByNumber' && BigInt(params[0])===pin && reply?.hash!==origin.block_hash) throw Error('Pin changed');
        return reply;
      };
      let count=0;
      const verifyOne = async p => {
        const start=performance.now();
        try{
          const report=await verifier.verify(p.id,p.dao_id);
          append('verification.jsonl',{on_chain_id:String(p.on_chain_id),proposal_id:p.id,status:report.status,wall_ms:performance.now()-start,report});
        }catch(e){
          append('verification.jsonl',{on_chain_id:String(p.on_chain_id),proposal_id:p.id,status:'failed',error_type:e.name,wall_ms:performance.now()-start});
        }
        if(++count%5===0 || count===initial.proposals.length) console.log('Verified attempts',count);
      };
      let next = 0;
      await Promise.all(Array.from({length:3}, async () => {
        while(next < initial.proposals.length) await verifyOne(initial.proposals[next++]);
      }));
    } finally { await readDb.destroy(); }
    await checkPin();
    write('completed.json',{finished_utc:new Date().toISOString()});
  } finally { await database.destroy(); }
}
main().catch(e=>{const error={utc:new Date().toISOString(),type:e.name,code:e.code??null,frames:String(e.stack).split('\n').slice(1,5),
  message:/^(Recovery database|Original |RPC differs|Incorrect built|Wrong RPC|Isolated container|Unexpected container)/.test(e.message)?e.message:null};
  if(fs.existsSync(out))write('failure.json',error);console.error('Recovery stopped',error);process.exitCode=1;});
