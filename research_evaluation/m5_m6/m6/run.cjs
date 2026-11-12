'use strict';
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..');
const spec=path.join(root,'apps/api/src/ai/__tests__/blockchain-verification.spec.ts');
const fixtureText=fs.readFileSync(spec,'utf8').split("describe('Read-only blockchain verification'")[0]
 .replace(/\.\.\/blockchain-verification\.(service|controller)/g,(_,n)=>path.join(root,'apps/api/dist/ai/blockchain-verification.'+n).replaceAll('\\','/'));
const mod=new Module(spec,module);mod.filename=spec;mod.paths=module.paths;
const js=ts.transpileModule(fixtureText+'\nexport {fixture, abi};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports','jest',js)(mod.require.bind(mod),mod.exports,require('jest-mock'));
const {fixture,abi}=mod.exports;
const blockHash='0x'+'44'.repeat(32);
const cases=[
 {id:'clean',kind:'control',expected:'verified',unsafe:false},
 {id:'stale-coherent-provider',kind:'stale RPC node',expected:'unverified',unsafe:true},
 {id:'lagging-provider',kind:'lagging RPC node',expected:'unverified',unsafe:true,mode:'lag'},
 {id:'wrong-chain',kind:'wrong chain ID',expected:'mismatched',unsafe:true,mode:'chain'},
 {id:'inconsistent-block-hash',kind:'inconsistent block hash',expected:'unverified',unsafe:true,mode:'hash'},
 {id:'missing-log',kind:'missing event log',expected:'mismatched',unsafe:true,mode:'missing'},
 {id:'duplicate-log',kind:'duplicate event log',expected:'verified',unsafe:false,mode:'duplicate'},
 {id:'out-of-order',kind:'out-of-order event logs',expected:'verified',unsafe:false,mode:'unordered'},
 {id:'partial-range',kind:'partial log range',expected:'unavailable',unsafe:true,mode:'partial',target:2000},
 {id:'timeout',kind:'RPC timeout',expected:'unavailable',unsafe:true,mode:'timeout'},
 {id:'connection',kind:'RPC connection failure',expected:'unavailable',unsafe:true,mode:'connection'},
 {id:'malformed',kind:'malformed RPC response',expected:'unavailable',unsafe:true,mode:'malformed'},
 {id:'reorg',kind:'reorganization during verification',expected:'unverified',unsafe:true,mode:'reorg'},
 {id:'checkpoint-behind',kind:'indexer checkpoint behind pin',expected:'unverified',unsafe:true,checkpoint:{processed_block_number:'99',processed_block_hash:null}},
 {id:'checkpoint-missing',kind:'missing checkpoint',expected:'unverified',unsafe:true,checkpoint:null},
 {id:'joint-omission',kind:'same event absent in SQL and RPC',expected:'unverified',unsafe:true,mode:'missing',stored:false},
];
if(!fs.existsSync(path.join(__dirname,'dataset.json'))) fs.writeFileSync(path.join(__dirname,'dataset.json'),JSON.stringify({
 source:'Actual C7 service and existing in-memory fixture with controlled RPC/SQL changes',
 cases,stale_policy:'Safe expectation for deliberate stale provider is unverified. Application has no independently trusted minimum height.',
},null,2),{flag:'wx'});
async function main(){
 for(const c of cases.filter(c=>!process.argv[2]||c.id===process.argv[2])){
  const checkpoint=c.checkpoint===undefined?{processed_block_number:String(c.target||100),processed_block_hash:blockHash}:c.checkpoint;
  const {service}=fixture({},c.stored!==false,checkpoint);
  const original=service.rpc.bind(service);
  let blocks=0;
  service.rpc=async(method,args)=>{
   if(c.mode==='timeout')throw Object.assign(Error('injected timeout'),{name:'TimeoutError'});
   if(c.mode==='connection')throw Object.assign(Error('injected connection failure'),{code:'ECONNREFUSED'});
   if(c.mode==='chain'&&method==='eth_chainId')return '0x1';
   const target=c.mode==='lag'?99:c.target||100;
   if(method==='eth_blockNumber')return '0x'+target.toString(16);
   if(method==='eth_getBlockByNumber'){
    blocks++;
    if((c.mode==='hash'||c.mode==='reorg')&&blocks>1)return {number:'0x'+target.toString(16),hash:'0x'+'77'.repeat(32),timestamp:'0xbb8'};
    return {number:'0x'+target.toString(16),hash:blockHash,timestamp:'0xbb8'};
   }
   if(method==='eth_getLogs'){
    if(c.mode==='missing')return [];
    if(c.mode==='partial'&&BigInt(args[0].fromBlock)>1n)return undefined;
    const response=await original(method,args);
    if(c.mode==='duplicate')return [...response,...response];
    if(c.mode==='unordered'){
     const extra=abi.encodeEventLog(abi.getEvent('MemberAssigned'),['28','0x'+'22'.repeat(20)]);
     return [{...extra,transactionHash:'0x'+'33'.repeat(32),logIndex:'0x1',blockNumber:'0x1',blockHash},...response];
    }
    return response;
   }
   if(c.mode==='malformed'&&method==='eth_call')return '0x00';
   return original(method,args);
  };
  if(c.mode==='unordered'){
   // Keep both sides coherent while permuting the provider delivery order.
   const originalDb=service.postgres.database.selectFrom;
   service.postgres.database.selectFrom=(table)=>{
    const q=originalDb(table);
    if(table==='governance_events'){
     const exec=q.execute;q.execute=async()=>[...(await exec()),{
      event_name:'MemberAssigned',evidence_id:'e2',transaction_hash:'0x'+'33'.repeat(32),log_index:'1',
      block_number:'1',block_hash:blockHash,event_args:{proposalId:'28',member:'0x'+'22'.repeat(20)},
     }];
    }
    return q;
   };
  }
  const started=performance.now();
  const report=await service.verify('p','dao');
  const row={...c,observed:report.status,correct:report.status===c.expected,
   fault_accepted:c.unsafe&&report.status==='verified',duration_ms:performance.now()-started,
   errors:report.errors,uncertainty:report.comparisons.filter(x=>x.status!=='verified').map(x=>({field:x.field.split(':')[0],status:x.status,reason:x.reason})),
   event_scan:report.event_scan,report};
  fs.appendFileSync(path.join(__dirname,process.argv[2]?'raw-corrected.jsonl':'raw.jsonl'),JSON.stringify(row)+'\n');
 }
 console.log('M6 controlled service cases',cases.length);
}
main().catch(e=>{console.error(e.name,e.message,String(e.stack).split('\n').slice(1,3));process.exitCode=1});
