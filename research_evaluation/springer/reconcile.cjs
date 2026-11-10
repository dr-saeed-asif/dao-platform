// Run from DAO root after npm run build --workspace=api. Only loopback HTTP and read-only SQL/RPC.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const {NestFactory} = require('@nestjs/core');
const {FastifyAdapter} = require('@nestjs/platform-fastify');
const {Module} = require('@nestjs/common');
const {ConfigService} = require('@nestjs/config');
const {sql} = require('kysely');
const {createPostgresDatabase} = require('@dao-platform/database');
const root = path.resolve(__dirname, '../..');
const compiled = path.join(root, 'apps/api/dist/ai/blockchain-verification.service.js');
const {BlockchainVerificationService} = require(compiled);
const {BlockchainVerificationController} = require(path.join(root, 'apps/api/dist/ai/blockchain-verification.controller.js'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const output = name => path.join(__dirname, name);
const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
const token = crypto.randomBytes(32).toString('hex');
const dsn = new URL(env.POSTGRES_URL);
dsn.searchParams.set('options', '-c default_transaction_read_only=on');
const database = createPostgresDatabase(dsn.toString());
const config = new ConfigService({...env, AI_SERVER_TOKEN: token});
const service = new BlockchainVerificationService({database}, config);
class ResearchModule {}
Module({controllers:[BlockchainVerificationController], providers:[
  {provide:BlockchainVerificationService,useValue:service},{provide:ConfigService,useValue:config}
]})(ResearchModule);

async function main() {
  const readOnly = (await sql`SHOW transaction_read_only`.execute(database)).rows[0].transaction_read_only;
  if (readOnly !== 'on') throw new Error('Read-only session required');
  const proposals = await database.selectFrom('proposals').select(['id','dao_id','on_chain_id','chain_id','contract_address']).orderBy('id').execute();
  const cohort = proposals.filter(p => p.on_chain_id != null && String(p.chain_id) === env.CYBERCHAIN_CHAIN_ID
    && p.contract_address?.toLowerCase() === env.GOVERNANCE_CONTRACT_ADDRESS?.toLowerCase());
  const compiledText = fs.readFileSync(compiled, 'utf8');
  const markers = ['public.proposal_assignments.count','Chain event has no indexed counterpart','scannedThrough'];
  if (!markers.every(m => compiledText.includes(m))) throw new Error('November verifier markers missing');
  const app = await NestFactory.create(ResearchModule,new FastifyAdapter(),{logger:false});
  try {
    await app.listen(0,'127.0.0.1');
    const url = await app.getUrl();
    const metadata = {
      started_utc:new Date().toISOString(), repo_revision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
      source_sha256:digest(path.join(root,'apps/api/src/ai/blockchain-verification.service.ts')),
      compiled_sha256:digest(compiled), markers, process_id:process.pid, isolated_loopback_nest:true,
      database_read_only:true, node:process.version, observed_rows:proposals.length, cohort_size:cohort.length,
      cohort_rule:'Non-null on-chain ID and matching configured network and contract; previous 39-item roster unavailable',
      cohort_ids:cohort.map(p=>p.id), per_proposal_pin:true, concurrency:2
    };
    const manifestPath=output('reconciliation_config.json');
    const rawPath=output('reconciliation.jsonl');
    if (fs.existsSync(manifestPath)) {
      const previous=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
      for (const k of ['repo_revision','source_sha256','compiled_sha256','cohort_ids']) {
        if (JSON.stringify(previous[k])!==JSON.stringify(metadata[k])) throw new Error('Checkpoint configuration changed');
      }
    } else fs.writeFileSync(manifestPath,JSON.stringify(metadata,null,2),{flag:'wx'});
    const saved=fs.existsSync(rawPath)?fs.readFileSync(rawPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
    const pending=cohort.filter(p=>!saved.some(r=>r.proposal_id===p.id));
    async function observe(p) {
      const begin=performance.now();
      const row={proposal_id:p.id,on_chain_id:String(p.on_chain_id),checked_utc:new Date().toISOString()};
      try {
        const r=await fetch(url+'/ai/internal/proposals/'+encodeURIComponent(p.id)+'/verification?dao_id='+encodeURIComponent(p.dao_id),
          {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(100000)});
        row.http=r.status;
        const report=await r.json();
        if (r.ok) {
          Object.assign(row,{status:report.status,block:report.block_number,block_hash:report.block_hash,
            service_ms:report.duration_ms, events:report.events.length, transactions:report.transactions.length,
            errors:report.errors, comparison_counts:{}, scalar_findings:[], event_findings:{}});
          for (const c of report.comparisons) {
            row.comparison_counts[c.status]=(row.comparison_counts[c.status]||0)+1;
            if (/^(governance_event|vote):/.test(c.field)) {
              const group=c.field.split(':')[0]+':'+c.status+(c.database===null?':chain_only':'');
              row.event_findings[group]=(row.event_findings[group]||0)+1;
            } else if (/^(voting_status|public\.|finalized|winning_option|tied|option_\d+_vote_count|chain_id)/.test(c.field)) {
              row.scalar_findings.push({field:c.field,status:c.status,database:c.database,blockchain:c.blockchain});
            }
          }
        } else row.status='http_failure';
      } catch(e) { row.status='transport_failure'; row.error_type=e.name; }
      row.wall_ms=performance.now()-begin;
      fs.appendFileSync(rawPath,JSON.stringify(row)+'\n',{flush:true});
      return row;
    }
    // A runtime assignment-count field proves the changed verifier executed.
    const pilot=cohort.find(p=>String(p.on_chain_id)==='38') ?? cohort[0];
    const probe=pilot && (saved.find(r=>r.proposal_id===pilot.id) ?? await observe(pilot));
    const runtimeVerified=Boolean(probe?.scalar_findings?.some(c=>c.field==='public.proposal_assignments.count'));
    fs.appendFileSync(output('deployment_checks.jsonl'),JSON.stringify({...metadata,runtimeVerified,
      probe_proposal:pilot?.id,probe_http:probe?.http,probe_status:probe?.status})+'\n',{flush:true});
    console.log('Runtime verifier marker:',runtimeVerified,'cohort:',cohort.length);
    if (!runtimeVerified) throw new Error('No assignment-count field returned by deployed verifier');
    const todo=pending.filter(p=>p.id!==pilot.id);
    let next=0;
    await Promise.all(Array.from({length:2},async()=>{
      while(next<todo.length) {
        const i=next++;
        await observe(todo[i]);
        if ((i+1)%5===0) console.log('Reconciliation attempts dispatched through',i+1,'/',todo.length);
      }
    }));
  } finally { await app.close(); }
}
main().catch(e=>{console.error(e.name, /^(Read-only|November|Checkpoint|No assignment)/.test(e.message)?e.message:'Research deployment or source access failed');process.exitCode=1;})
  .finally(()=>database.destroy());
