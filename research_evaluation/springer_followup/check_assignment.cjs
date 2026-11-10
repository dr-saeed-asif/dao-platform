// Independently compare current SQL rows with direct contract reads at the archived block.
const fs = require('node:fs');
const { Interface } = require('ethers');
const { Client } = require('pg');
const env = require('dotenv').parse(fs.readFileSync('.env'));
const abi = new Interface([
  'function isAssigned(uint256,address) view returns (bool)',
  'function getProposal(uint256) view returns (tuple(bytes32,string,uint64,uint64,uint16,uint16,uint32,uint32,uint8,bool,bool,bool))'
]);
const before = fs.readFileSync(__dirname+'/../springer/reconciliation.jsonl','utf8').trim().split('\n').map(JSON.parse);
const target = before.find(row=>row.scalar_findings?.some(f=>f.field==='public.proposal_assignments.count'&&f.status==='mismatched'));
const block = '0x'+BigInt(target.block).toString(16);
async function rpc(method,params) {
  const res=await fetch(env.CYBERCHAIN_RPC_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
  const body=await res.json();
  if(!res.ok||body.error||body.result==null) throw Error('RPC read failed');
  return body.result;
}
async function read(name,args) {
  const data=abi.encodeFunctionData(name,args);
  return abi.decodeFunctionResult(name,await rpc('eth_call',[{to:env.GOVERNANCE_CONTRACT_ADDRESS,data},block]))[0];
}
async function main(){
  const db=new Client({connectionString:env.POSTGRES_URL});
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows}=await db.query('SELECT member_address FROM public.proposal_assignments WHERE proposal_id=$1 AND assigned IS TRUE',[target.proposal_id]);
    const unique=[...new Set(rows.map(row=>row.member_address.toLowerCase()))];
    const chainId=String(BigInt(await rpc('eth_chainId',[])));
    const first=await rpc('eth_getBlockByNumber',[block,false]);
    if(chainId!==env.CYBERCHAIN_CHAIN_ID||first.hash!==target.block_hash) throw Error('Archived chain or block differs');
    const contractCount=Number((await read('getProposal',[target.on_chain_id]))[6]);
    const memberships=await Promise.all(unique.map(address=>read('isAssigned',[target.on_chain_id,address])));
    const second=await rpc('eth_getBlockByNumber',[block,false]);
    if(second.hash!==first.hash) throw Error('Block hash changed during read');
    const evidence={observed_utc:new Date().toISOString(),proposal_id:target.proposal_id,on_chain_id:target.on_chain_id,
      chain_id:chainId,block:target.block,block_hash:first.hash,sql_active_rows:rows.length,sql_distinct_members:unique.length,
      contract_active_count:contractCount,sql_members_confirmed_on_chain:memberships.filter(Boolean).length,
      sql_members_not_assigned_at_pin:memberships.filter(value=>!value).length,
      scope:'Current read-only SQL snapshot compared with the historical contract block. Historical SQL and cause are unverified. No addresses exported.'};
    fs.writeFileSync(__dirname+'/assignment_independent.json',JSON.stringify(evidence,null,2),{flag:'wx'});
    console.log('SQL rows',rows.length,'distinct',unique.length,'contract',contractCount,'membership matches',memberships.filter(Boolean).length);
  } finally { await db.end(); }
}
main().catch(e=>{console.error(e.code||e.name);process.exitCode=1;});
