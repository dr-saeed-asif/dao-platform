'use strict';
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {ConfigService}=require('@nestjs/config');
const {createPostgresDatabase}=require('@dao-platform/database');
const {ResearchService}=require(path.resolve('apps/api/dist/research/research.service'));
const {LocalArtefactStorage}=require(path.resolve('apps/api/dist/research/local-artefact.storage'));
const docker=(...a)=>cp.execFileSync('docker',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const name='cyberdao-recovery-m4-01',port=docker('port',name,'5432/tcp').split(':').at(-1);
const secret=docker('exec',name,'printenv','POSTGRES_PASSWORD');
const database=createPostgresDatabase('postgres://postgres:'+encodeURIComponent(secret)+'@127.0.0.1:'+port+'/m5_document_integrity_postfix');
const config=new ConfigService({ARTEFACT_STORAGE_DIR:path.join(__dirname,'storage')});
const service=new ResearchService({database},config,new LocalArtefactStorage(config));
async function main(){
 const rows=fs.readFileSync(path.join(__dirname,'python-raw.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const stale=rows.find(r=>r.id==='stale-chunks');
 let rejected=false;
 try{await service.download(stale.document_identifier);}catch{rejected=true;}
 const failed=await service.getArtefact(stale.document_identifier);
 const repeat=rows.find(r=>r.id==='reupload');
 const artifact=await database.selectFrom('artefacts').selectAll().where('evidence_id','=',repeat.document_identifier).executeTakeFirstOrThrow();
 const bytes=fs.readFileSync(path.join(__dirname,'storage',artifact.storage_key));
 const start=performance.now();
 const [reupload]=await service.stage([{filename:'proposal.pdf',mediaType:'application/pdf',bytes}]);
 fs.writeFileSync(path.join(__dirname,'after-index.json'),JSON.stringify({
  stale_download_rejected:rejected,stale_verification_status:failed.verification_status,
  reupload_same_identity:reupload.evidence_id===repeat.document_identifier,reupload_duration_ms:performance.now()-start,
 },null,2),{flag:'wx'});
}
main().catch(e=>{console.error(e.name);process.exitCode=1}).finally(()=>database.destroy());
