// Exercise the built verifier with controlled in-memory DB/RPC fixtures.
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
const root=path.resolve(__dirname,'../..');
const spec=path.join(root,'apps/api/src/ai/__tests__/blockchain-verification.spec.ts');
// Reuse only fixture definitions. No existing test body is executed.
const fixtureText=fs.readFileSync(spec,'utf8').split("describe('Read-only blockchain verification'")[0]
  .replace(/\.\.\/blockchain-verification\.(service|controller)/g,(_,name)=>path.join(root,'apps/api/dist/ai/blockchain-verification.'+name).replaceAll('\\','/'));
const mod=new Module(spec,module);
mod.filename=spec;mod.paths=module.paths;
const fakeJest={
  fn(fn){return fn;},
  spyOn(target,key){return {mockImplementation(fn){target[key]=fn;return fn;}};}
};
const js=ts.transpileModule(fixtureText+'\nexport {fixture};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports','jest',js)(mod.require.bind(mod),mod.exports,fakeJest);
const {fixture}=mod.exports;
const cases=[
  {id:'clean',class:'negative',expected:'verified'},
  {id:'indexed_total_mutated',class:'positive',expected:'mismatched',overrides:{total_votes:'7'},field:'public.proposals.total_votes'},
  {id:'actually_open_stored_closed',class:'positive',expected:'mismatched',overrides:{status:'ACTIVE'},field:'voting_status'},
  {id:'finalized_status_alias',class:'semantic_control',expected:'verified',overrides:{status:'FINALIZED'},field:'voting_status'},
  {id:'indexed_event_missing_from_complete_rpc_scan',class:'positive',expected:'mismatched',rpc:'missing_chain_event',field:'governance_event:'},
  {id:'chain_event_missing_from_index_unknown_checkpoint',class:'incomplete',expected:'unverified',stored:false,field:'governance_event:'},
  {id:'known_stale_index_checkpoint',class:'capability_gap',expected:'unverified',stored:false,field:'governance_event:'},
  {id:'snapshot_hash_changes',class:'positive',expected:'unverified',rpc:'reorg',error:'reorganization'},
  {id:'rpc_unavailable',class:'infrastructure',expected:'unavailable',rpc:'offline'}
];
async function main(){
  const rows=[];
  for(const c of cases){
    const overrides={...c.overrides};
    if(c.id==='finalized_status_alias')Object.assign(overrides,{finalized_at:new Date(2000000),winning_option:'0',tied:false});
    const {service}=fixture(overrides,c.stored!==false);
    const original=service.rpc.bind(service);let blocks=0;
    service.rpc=async(method,args)=>{
      if(c.rpc==='offline')throw Error('Injected RPC outage');
      if(c.rpc==='missing_chain_event' && method==='eth_getLogs')return [];
      if(c.rpc==='reorg' && method==='eth_getBlockByNumber' && ++blocks===2)return {hash:'0x'+'66'.repeat(32)};
      if(c.id==='finalized_status_alias' && method==='eth_call'){
        const call=service.abi.parseTransaction({data:args[0].data});
        if(call.name==='getProposal'){
          const value=service.abi.decodeFunctionResult('getProposal',await original(method,args))[0].toArray();
          value[10]=true;
          return service.abi.encodeFunctionResult('getProposal',[value]);
        }
      }
      return original(method,args);
    };
    // This metadata is deliberately supplied to the fixture row. The verifier has no checkpoint input.
    if(c.class==='capability_gap')overrides.indexer_checkpoint_block='0';
    const start=performance.now();const result=await service.verify('p','dao');
    const target=result.comparisons.filter(x=>c.field && x.field.startsWith(c.field)).map(x=>({field:x.field,status:x.status}));
    const targetOK=c.error?result.errors.some(x=>x.includes(c.error)):!c.field||target.some(x=>x.status===c.expected);
    rows.push({case:c.id,class:c.class,expected:c.expected,observed:result.status,target,targetOK,
      matches:c.expected===result.status&&targetOK,latency_ms:performance.now()-start,errors:result.errors,
      checkpoint_specific_diagnosis: c.class==='capability_gap'?result.comparisons.some(x=>/stale checkpoint/i.test(x.reason||'')):null});
  }
  const config={environment:'Isolated in-memory DB/RPC fixtures; real freshly built verifier. No external requests.',
    replicates:1,fixture:'apps/api/src/ai/__tests__/blockchain-verification.spec.ts (fixture definitions only)',
    compiled_sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'apps/api/dist/ai/blockchain-verification.service.js'))).digest('hex'),
    cases,results:rows};
  fs.writeFileSync(path.join(__dirname,'fault_injection.json'),JSON.stringify(config,null,2),{flag:'wx'});
  console.log(rows.map(r=>[r.case,r.observed,r.matches]));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
