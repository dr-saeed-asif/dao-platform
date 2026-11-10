// Reconstruct membership from complete chain history at the archived block.
const fs = require('node:fs');
const {Client} = require('pg');
const {Interface, toBeHex, zeroPadValue} = require('ethers');
const env = require('dotenv').parse(fs.readFileSync('.env'));
const prior = JSON.parse(fs.readFileSync(__dirname+'/../springer_followup/assignment_independent.json','utf8'));
const abi = new Interface([
  'event MemberAssigned(uint256 indexed proposalId,address indexed member)',
  'event MemberUnassigned(uint256 indexed proposalId,address indexed member)',
  'function isAssigned(uint256,address) view returns(bool)',
  'function getProposal(uint256) view returns(tuple(bytes32,string,uint64,uint64,uint16,uint16,uint32,uint32,uint8,bool,bool,bool))'
]);
async function rpc(method,params) {
  const response=await fetch(env.CYBERCHAIN_RPC_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  if (!response.ok || body.error || body.result==null) throw Error('RPCReadFailed');
  return body.result;
}
async function main() {
  const db=new Client({connectionString:env.POSTGRES_URL});await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const rows=(await db.query('SELECT member_address,assigned,latest_evidence_id,effective_from,updated_at,transaction_hash FROM public.proposal_assignments WHERE proposal_id=$1',[prior.proposal_id])).rows;
    const stored=(await db.query('SELECT event_name,event_args,block_number,block_hash,canonical FROM public.governance_events WHERE proposal_id=$1 AND chain_id=$2 AND contract_address=$3 ORDER BY block_number,log_index',[prior.on_chain_id,prior.chain_id,env.GOVERNANCE_CONTRACT_ADDRESS])).rows;
    const creation=stored.find(e=>e.event_name==='ProposalCreated'&&e.canonical);
    if(!creation)throw Error('CreationCheckpointUnavailable');
    const from=BigInt(creation.block_number),end=BigInt(prior.block),tag=toBeHex(end);
    const initial=await rpc('eth_getBlockByNumber',[tag,false]);
    if(initial.hash!==prior.block_hash)throw Error('ArchivedBlockChanged');
    const network=String(BigInt(await rpc('eth_chainId',[])));
    if(network!==prior.chain_id)throw Error('NetworkChanged');
    const ranges=[];
    for(let start=from;start<=end;start+=1000n)ranges.push([start,start+999n<end?start+999n:end]);
    let next=0;const logs=[];
    await Promise.all(Array.from({length:4},async()=>{
      while(next<ranges.length){const [a,b]=ranges[next++];
        logs.push(...await rpc('eth_getLogs',[{address:env.GOVERNANCE_CONTRACT_ADDRESS,fromBlock:toBeHex(a),toBlock:toBeHex(b),
          topics:[[abi.getEvent('MemberAssigned').topicHash,abi.getEvent('MemberUnassigned').topicHash],zeroPadValue(toBeHex(BigInt(prior.on_chain_id)),32)]}]));
      }
    }));
    logs.sort((a,b)=>Number(BigInt(a.blockNumber)-BigInt(b.blockNumber))||Number(BigInt(a.logIndex)-BigInt(b.logIndex)));
    const active=new Set();const last=new Map();const counts={MemberAssigned:0,MemberUnassigned:0};
    for(const log of logs){
      if(log.removed)throw Error('RemovedLogReturned');
      const event=abi.parseLog(log);const member=event.args.member.toLowerCase();
      counts[event.name]++;last.set(member,{name:event.name,block:String(BigInt(log.blockNumber))});
      if(event.name==='MemberAssigned')active.add(member);else active.delete(member);
    }
    const value=abi.decodeFunctionResult('getProposal',await rpc('eth_call',[{to:env.GOVERNANCE_CONTRACT_ADDRESS,data:abi.encodeFunctionData('getProposal',[prior.on_chain_id])},tag]))[0];
    const discrepancies=[];
    for(const row of rows.filter(r=>r.assigned)){
      const address=row.member_address.toLowerCase();
      if(active.has(address))continue;
      const observed=abi.decodeFunctionResult('isAssigned',await rpc('eth_call',[{to:env.GOVERNANCE_CONTRACT_ADDRESS,data:abi.encodeFunctionData('isAssigned',[prior.on_chain_id,address])},tag]))[0];
      const indexed=stored.filter(e=>e.canonical&&String(e.event_args?.member).toLowerCase()===address).map(e=>({name:e.event_name,block:String(e.block_number)}));
      let receipt=null;
      if(row.transaction_hash){try{receipt=await rpc('eth_getTransactionReceipt',[row.transaction_hash]);}catch{}}
      discrepancies.push({contract_isAssigned:observed,last_chain_membership_event:last.get(address)||null,
        indexed_membership_events:indexed,latest_evidence_present:Boolean(row.latest_evidence_id),
        effective_from:row.effective_from,updated_at:row.updated_at,
        sql_transaction_reference_present:Boolean(row.transaction_hash),transaction_receipt_found:Boolean(receipt),
        receipt_status:receipt?.status??null});
    }
    const final=await rpc('eth_getBlockByNumber',[tag,false]);if(final.hash!==initial.hash)throw Error('PinChanged');
    const result={checked_utc:new Date().toISOString(),proposal_id:prior.proposal_id,on_chain_id:prior.on_chain_id,
      from_creation_block:String(from),pinned_block:String(end),pinned_hash:initial.hash,ranges_completed:ranges.length,
      full_creation_to_pin_scan:true,event_counts:counts,reconstructed_assigned_members:active.size,
      contract_assigned_count:Number(value[6]),sql_active_rows:rows.filter(r=>r.assigned).length,
      discrepancies,privacy:'Addresses and member transaction hashes omitted',
      limitation:'Current SQL state and creation-to-pin chain logs; no historical SQL row version or indexer checkpoint guarantee.'};
    fs.writeFileSync(__dirname+'/assignment_history.json',JSON.stringify(result,null,2),{flag:'wx'});
    console.log('Historical events',counts,'reconstructed',active.size,'contract',Number(value[6]),'SQL-only active rows',discrepancies.length);
  }finally{await db.end();}
}
main().catch(e=>{console.error(e.code||e.name,e.message==='RPCReadFailed'?e.message:'Historical verification failed');process.exitCode=1;});
