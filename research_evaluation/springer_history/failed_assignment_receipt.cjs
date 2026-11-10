// Inspect transaction provenance for active SQL rows lacking canonical membership evidence.
const fs=require('node:fs');
const {Client}=require('pg');
const {Interface,toBeHex}=require('ethers');
const env=require('dotenv').parse(fs.readFileSync('.env'));
const prior=JSON.parse(fs.readFileSync(__dirname+'/assignment_history.json','utf8'));
const abi=new Interface(['function assignMembers(uint256 proposalId,address[] members)']);
async function rpc(method,params){
  const response=await fetch(env.CYBERCHAIN_RPC_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok||data.error)throw Error('RPCReadFailed');return data.result;
}
async function main(){
  const db=new Client({connectionString:env.POSTGRES_URL});await db.connect();
  try{
    await db.query('BEGIN READ ONLY');
    const rows=(await db.query('SELECT member_address,transaction_hash FROM public.proposal_assignments WHERE proposal_id=$1 AND assigned IS TRUE AND latest_evidence_id IS NULL',[prior.proposal_id])).rows;
    const failed=[];
    for(const row of rows){
      if(!row.transaction_hash)continue;
      const receipt=await rpc('eth_getTransactionReceipt',[row.transaction_hash]);
      if(receipt?.status!=='0x0')continue;
      const tx=await rpc('eth_getTransactionByHash',[row.transaction_hash]);
      let parsed=null;try{parsed=abi.parseTransaction({data:tx.input});}catch{}
      const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
      failed.push({receipt_status:receipt.status,receipt_block:String(BigInt(receipt.blockNumber)),
        canonical_receipt_block:block?.hash===receipt.blockHash,receipt_before_pin:BigInt(receipt.blockNumber)<=BigInt(prior.pinned_block),
        targets_configured_contract:tx.to?.toLowerCase()===env.GOVERNANCE_CONTRACT_ADDRESS.toLowerCase(),
        decoded_method:parsed?.name??null,decoded_proposal_matches:parsed?String(parsed.args.proposalId)===prior.on_chain_id:false,
        active_sql_member_in_transaction:parsed?parsed.args.members.some(m=>m.toLowerCase()===row.member_address.toLowerCase()):false,
        receipt_log_count:receipt.logs.length});
    }
    fs.writeFileSync(__dirname+'/failed_assignment_receipt.json',JSON.stringify({checked_utc:new Date().toISOString(),
      sql_active_rows_without_evidence_checked:rows.length,failed_references:failed,
      limitation:'Confirms SQL reference to a reverted assignment call; does not identify the application/import path that wrote the row. Addresses, transaction hashes and keys omitted.'},null,2),{flag:'wx'});
    console.log('Failed assignment references:',failed.length,'proposal/member matches:',failed.filter(r=>r.decoded_proposal_matches&&r.active_sql_member_in_transaction).length);
  }finally{await db.end();}
}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
