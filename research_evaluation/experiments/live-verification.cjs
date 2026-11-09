const fs=require('node:fs');
const env=require('dotenv').parse(fs.readFileSync('.env'));
const base='http://127.0.0.1:3002/v1';
const ids=[['pilot','e3b14215-bd47-420a-ae5a-a50d15cf0255','cyber-dao-321'],['training','38a3c43c-1e3b-47c9-8688-20e6e64ec495','cyber-test-dao'],['cleanup','16dadecc-94cc-4fae-8089-921765854976','Community Clean-Up Initiative'],['testing','onchain-28','cyber-test']];
async function main(){
 const cases=[];
 for(const [label,id,dao] of ids){
  const path='/ai/internal/proposals/'+id+'/verification?dao_id='+encodeURIComponent(dao);
  const start=performance.now();
  try{
   const response=await fetch(base+path,{headers:{Authorization:'Bearer '+env.AI_SERVER_TOKEN},signal:AbortSignal.timeout(95000)});
   const r=await response.json();
   const statuses={};
   const rows=(r.comparisons??[]).map(c=>{
     statuses[c.status]=(statuses[c.status]??0)+1;
     const group=c.field.split(':')[0];
     const scalar=!c.field.includes(':') && ['voting_status','public.votes.count','public.proposals.total_votes','public.proposal_assignments.count','finalized'].includes(c.field)||/^option_\d+_vote_count$/.test(c.field);
     return {field:group,status:c.status,...(scalar?{database:c.database,blockchain:c.blockchain}:{})};
   });
   cases.push({label,block:r.block_number,chain:r.chain_id,observed_at:r.observed_at,http:response.status,status:r.status,ms:performance.now()-start,counts:statuses,rows,events:r.events?.length,transactions:r.transactions?.length,error_count:r.errors?.length});
  }catch(e){cases.push({label,error:e.name,ms:performance.now()-start});}
 }
 const path='/ai/internal/proposals/'+ids[0][1]+'/verification';
 const probes=[
 ['no_wallet_token','/ai/assistant/conversations?proposalId='+ids[0][1],{},401],
 ['forged_wallet_token','/ai/assistant/conversations?proposalId='+ids[0][1],{Authorization:'Bearer invalid.token'},401],
 ['forged_actor_header','/ai/assistant/conversations?proposalId='+ids[0][1],{'x-wallet-address':'0x'+'ab'.repeat(20)},401],
 ['no_operator_token',path+'?dao_id='+ids[0][2],{},401],
 ['wrong_operator_token',path+'?dao_id='+ids[0][2],{Authorization:'Bearer invalid'},401],
 ['wrong_dao',path+'?dao_id=unrelated-dao',{Authorization:'Bearer '+env.AI_SERVER_TOKEN},403]];
 const auth=[];
 for(const [label,path,headers,expected] of probes)try{
   const response=await fetch(base+path,{headers,signal:AbortSignal.timeout(10000)});
   auth.push({label,expected,observed:response.status,pass:response.status===expected});
 }catch(e){auth.push({label,expected,error:e.name,pass:false});}
 fs.writeFileSync(process.argv[2],JSON.stringify({cases,auth},null,2));
 console.log(JSON.stringify({cases:cases.map(({rows,...r})=>r),auth},null,2));
}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
