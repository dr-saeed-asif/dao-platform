'use strict';
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {ConfigService}=require('@nestjs/config');
const dbpkg=require('@dao-platform/database');
const {ResearchService}=require(path.resolve('apps/api/dist/research/research.service'));
const {LocalArtefactStorage}=require(path.resolve('apps/api/dist/research/local-artefact.storage'));
const root=path.resolve(__dirname,'../../..'),out=__dirname;
const docker=(...a)=>cp.execFileSync('docker',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const name='cyberdao-recovery-m4-01',port=/127\.0\.0\.1:(\d+)/.exec(docker('port',name,'5432/tcp'))[1];
const secret=docker('exec',name,'printenv','POSTGRES_PASSWORD');
const database=dbpkg.createPostgresDatabase('postgres://postgres:'+encodeURIComponent(secret)+'@127.0.0.1:'+port+'/m5_document_integrity');
const dir=path.join(out,'storage');
const config=new ConfigService({ARTEFACT_STORAGE_DIR:dir,ARTEFACT_MAX_FILE_SIZE:10485760});
const service=new ResearchService({database},config,new LocalArtefactStorage(config));
const fixtures=path.join(out,'fixtures'),original=fs.readFileSync(path.join(fixtures,'original.pdf')),other=fs.readFileSync(path.join(fixtures,'other.pdf'));
const cases=[
 ['valid','control','accept'],['one-byte','tamper','reject'],['same-name-other-pdf','tamper','reject'],
 ['cross-proposal','scope','reject'],['wrong-hash','hash','reject'],['manifest-entry','manifest','reject'],
 ['uri-association','manifest','reject'],['wrong-media','media','reject'],['oversized','size','reject'],
 ['corrupt','format','reject'],['missing','availability','reject'],['reupload','control','accept'],
 ['stale-chunks','tamper','reject'],['duplicate','control','accept'],['manifest-size','manifest','reject']
].map(([id,category,expected])=>({id,category,expected,expected_basis:'Trusted bytes, original committed manifest and usable parseable PDF; unchanged reupload/dedup should succeed'}));
fs.writeFileSync(path.join(out,'dataset.json'),JSON.stringify({fixture_only:true,chain_anchor:'Synthetic ProposalCreated records in isolated SQL; no chain transactions',cases},null,2),{flag:'wx'});
async function seed(id,artifact){
 const input={daoId:'m5-dao',title:'Fixture '+id,purpose:'Research validation',description:'Synthetic document integrity fixture',proposalType:'STANDARD',options:['Approve','Reject'],startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-10-02T00:00:00Z',evidenceIds:[artifact.evidence_id]};
 const manifest=await service.createManifest(input);
 const suffix=cases.findIndex(x=>x.id===id)+10001;
 const tx='0x'+suffix.toString(16).padStart(64,'0');
 const eid='event:1212:0x51b43885899bd0301c2beea89addc9d876145d21:'+tx+':0';
 const args={proposalId:String(suffix),creator:'0x'+'22'.repeat(20),metadataURI:manifest.metadataURI,metadataHash:manifest.metadataHash,startsAt:String(Date.parse(input.startsAt)/1000),endsAt:String(Date.parse(input.endsAt)/1000),optionCount:'2',proposalType:'0'};
 await new dbpkg.PostgresGovernanceEventRepository(database).saveGovernanceEvent({evidenceId:eid,chainId:'1212',contractAddress:'0x51b43885899bd0301c2beea89addc9d876145d21',eventName:'ProposalCreated',transactionHash:tx,transactionIndex:0,logIndex:0,blockNumber:'16000000',blockHash:tx,blockTimestamp:String(Date.parse(input.startsAt)/1000),transactionSender:args.creator,eventArgs:args,ingestionTimestamp:new Date().toISOString()});
 await database.insertInto('proposals').values({id:'m5-'+id,dao_id:'m5-dao',idempotency_key:'m5-'+id,on_chain_id:String(suffix),chain_id:'1212',contract_address:'0x51b43885899bd0301c2beea89addc9d876145d21',creator_address:args.creator,proposal_type:'STANDARD',title:input.title,purpose:input.purpose,description:input.description,metadata_uri:manifest.metadataURI,metadata_hash:manifest.metadataHash,metadata:'{}',starts_at:new Date(input.startsAt),ends_at:new Date(input.endsAt),status:'ACTIVE',creation_evidence_id:eid,created_at:new Date(),updated_at:new Date()}).execute();
 return {manifest,proposal_id:'m5-'+id};
}
async function main(){
 await dbpkg.migratePostgresToLatest(database);
 const result=[];
 for(const c of cases){
  const started=performance.now();
  const unique=Buffer.concat([original,Buffer.from('\n%fixture-'+c.id)]);
  let bytes=c.id==='corrupt'?fs.readFileSync(path.join(fixtures,'corrupt.pdf')):unique;
  const row={...c,started_utc:new Date().toISOString(),document_identifier:null,original_hash:dbpkg.sha256(bytes),observed_hash:null,manifest_outcome:'not_attempted',actual_admission:'reject',error:null,indexing:'not_attempted'};
  let artifact,stored,anchor;
  try{
   const stageBytes=c.id==='oversized'?Buffer.alloc(10485761,32):bytes;
   const staged=await service.stage([{filename:'proposal.pdf',mediaType:c.id==='wrong-media'?'image/png':'application/pdf',bytes:stageBytes}]);
   artifact=staged[0]; row.document_identifier=artifact.evidence_id;
   stored=await database.selectFrom('artefacts').selectAll().where('evidence_id','=',artifact.evidence_id).executeTakeFirstOrThrow();
   if(c.id==='duplicate'||c.id==='reupload'){
    const second=await service.stage([{filename:'proposal.pdf',mediaType:'application/pdf',bytes}]);
    row.same_evidence_id=second[0].evidence_id===artifact.evidence_id;
   }
   anchor=await seed(c.id,artifact); row.proposal_id=anchor.proposal_id;
   if(c.id==='one-byte') bytes=Buffer.from(bytes.toString('latin1').replace('2000','9000'),'latin1');
   if(c.id==='same-name-other-pdf'||c.id==='stale-chunks')bytes=other;
   if(['one-byte','same-name-other-pdf'].includes(c.id)) fs.writeFileSync(path.join(dir,stored.storage_key),bytes);
   if(c.id==='wrong-hash') await database.updateTable('artefacts').set({expected_hash:'0x'+'00'.repeat(32)}).where('evidence_id','=',artifact.evidence_id).execute();
   if(['manifest-entry','uri-association','manifest-size'].includes(c.id)){
    const changed=JSON.parse(anchor.manifest.canonicalJson);
    if(c.id==='manifest-entry')changed.artefacts[0].filename='altered.pdf';
    if(c.id==='uri-association')changed.artefacts[0].uri='/wrong-uri';
    if(c.id==='manifest-size')changed.artefacts[0].size+=1;
    const text=dbpkg.canonicalSerialize(changed);
    await database.updateTable('proposals').set({metadata_uri:'data:application/json;base64,'+Buffer.from(text).toString('base64')}).where('id','=',anchor.proposal_id).execute();
   }
   if(c.id==='missing')fs.unlinkSync(path.join(dir,stored.storage_key));
   let linkIds=[artifact.evidence_id];
   if(c.id==='cross-proposal'){
    const [b]=await service.stage([{filename:'proposal.pdf',mediaType:'application/pdf',bytes:other}]);linkIds=[b.evidence_id];
   }
   await service.link(anchor.proposal_id,linkIds);
   row.manifest_outcome='accepted';row.actual_admission='accept';
  }catch(e){row.error=e.message;row.error_type=e.name;row.manifest_outcome=anchor?'rejected':'not_attempted';}
  row.observed_hash=stored&&fs.existsSync(path.join(dir,stored.storage_key))?dbpkg.sha256(fs.readFileSync(path.join(dir,stored.storage_key))):null;
  row.duration_ms=performance.now()-started;
  result.push(row);
  fs.appendFileSync(path.join(out,'nest-raw.jsonl'),JSON.stringify(row)+'\n');
 }
 const data={artefacts:await database.selectFrom('artefacts').selectAll().execute(),proposals:await database.selectFrom('proposals').selectAll().execute(),links:await database.selectFrom('proposal_artefacts').selectAll().execute()};
 fs.writeFileSync(path.join(out,'sql-fixture.local.json'),JSON.stringify(data));
 console.log('M5 Nest admission cases',result.length,'accepted',result.filter(x=>x.actual_admission==='accept').map(x=>x.id));
}
main().catch(e=>{console.error('M5 harness failed',e.name,e.code??'',String(e.stack).split('\n').slice(1,3));process.exitCode=1;}).finally(()=>database.destroy());
