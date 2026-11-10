// Read the corrected verifier with the same exported SQL snapshot as all model tools.
require('reflect-metadata');
const fs=require('node:fs');
const path=require('node:path');
const {ConfigService}=require('@nestjs/config');
const {sql}=require('kysely');
const {createPostgresDatabase}=require('@dao-platform/database');
const root=path.resolve(__dirname,'../..');
const {BlockchainVerificationService}=require(path.join(root,'apps/api/dist/ai/blockchain-verification.service.js'));
const env=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
const snapshot=process.argv[2],output=process.argv[3];
if(!/^[0-9A-Fa-f-]+$/.test(snapshot))throw Error('Invalid SQL snapshot ID');
const dsn=new URL(env.POSTGRES_URL);dsn.searchParams.set('options','-c default_transaction_read_only=on');
const db=createPostgresDatabase(dsn.toString());
function clean(value){
  if(typeof value==='string')return value.replace(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])|https?:\/\/\S+/g,'[redacted]');
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));
  return value;
}
async function main(){
  const result=await db.transaction().setIsolationLevel('repeatable read').execute(async trx=>{
    await sql.raw("SET TRANSACTION SNAPSHOT '"+snapshot+"'").execute(trx);
    const verifier=new BlockchainVerificationService({database:trx},new ConfigService(env));
    const ids=['e3b14215-bd47-420a-ae5a-a50d15cf0255','38a3c43c-1e3b-47c9-8688-20e6e64ec495'];
    const records=[];
    for(const id of ids){
      const report=await verifier.verify(id);
      if(!report.block_number||report.errors.length)throw Error('Chain snapshot incomplete');
      records.push(report);
    }
    return records;
  });
  fs.writeFileSync(output,JSON.stringify(clean(result),null,2));
  console.log('Corrected-verifier frozen chain scopes',result.length);
}
main().catch(e=>{console.error(e.name);process.exitCode=1;}).finally(()=>db.destroy());
