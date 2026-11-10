// Independent direct eth_call reads at the saved blocks. No transaction method.
const fs=require('node:fs'),path=require('node:path');
const {Interface}=require('ethers');
const env=require('dotenv').parse(fs.readFileSync('.env'));
const root=path.resolve(__dirname,'..');
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'evidence/snapshot.json'),'utf8'));
const abi=new Interface(['function getProposal(uint256) view returns (tuple(bytes32 metadataHash,string metadataURI,uint64 startsAt,uint64 endsAt,uint16 optionCount,uint16 winningOption,uint32 assignedMemberCount,uint32 voteCount,uint8 proposalType,bool cancelled,bool finalized,bool tied))']);
async function rpc(method,params){
 if(!['eth_chainId','eth_getBlockByNumber','eth_call'].includes(method))throw Error('Read method required');
 const r=await fetch(env.CYBERCHAIN_RPC_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
 const v=await r.json(); if(v.error||!r.ok)throw Error('RPCReadFailed');return v.result;
}
async function main(){
 const results=[];
 let networkChain=null,networkError=null;
 try{networkChain=BigInt(await rpc('eth_chainId',[])).toString();}catch(e){networkError=e.name;}
 for(const [label,db] of Object.entries(snapshot.database)){
  const saved=snapshot.blockchain[label],tag='0x'+BigInt(saved.block_number).toString(16);
  try{
   const block=await rpc('eth_getBlockByNumber',[tag,false]);
   const decoded=abi.decodeFunctionResult('getProposal',await rpc('eth_call',[{to:env.GOVERNANCE_CONTRACT_ADDRESS,data:abi.encodeFunctionData('getProposal',[db.on_chain_id])},tag]))[0];
   const fields=['startsAt','endsAt','optionCount','winningOption','assignedMemberCount','voteCount','proposalType','cancelled','finalized','tied'];
   const observations=Object.fromEntries(fields.map(k=>[k,typeof decoded[k]==='bigint'?decoded[k].toString():decoded[k]]));
   const matches=Object.fromEntries(fields.map(k=>[k,String(observations[k])===String(saved.proposal[k])]));
   results.push({label,block:saved.block_number,network_chain_id:networkChain,chain_id_matches:networkChain===String(saved.chain_id),block_hash_matches:block.hash.toLowerCase()===saved.block_hash.toLowerCase(),field_matches:matches,observations});
  }catch(e){results.push({label,block:saved.block_number,error:e.name+': '+e.message.replace(/https?:\/\/\S+/g,'[redacted]')});}
 }
 const output=process.argv[2]||path.join(root,'evidence/independent_chain_check.json');
 fs.writeFileSync(output,JSON.stringify({checked_utc:new Date().toISOString(),method:'Direct eth_call at saved block; current eth_chainId plus matching historical block hash establishes network identity',networkError,results},null,2));
 console.log(JSON.stringify(results.map(r=>({label:r.label,block_hash_matches:r.block_hash_matches,matching_fields:r.field_matches?Object.values(r.field_matches).filter(Boolean).length:null,error:r.error}))));
}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
