"""Freeze completed files and source identifiers; never include private environment files."""
import datetime,hashlib,json,re,subprocess
from pathlib import Path
H=Path(__file__).resolve().parents[1];D=H.parent;AI=Path('E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def git(repo,*args):return subprocess.check_output(['git',*args],cwd=repo,text=True,encoding='utf8').strip()
required=['BENCHMARK_AUDIT.md','BASELINE_B1_B4_RESULTS.csv','ABLATION_EXPERIMENT_RESULTS.csv','CLAIM_VERIFICATION_RESULTS.csv','STATISTICAL_ANALYSIS.md','FAILURE_ANALYSIS.md','HUMAN_ANNOTATION_STATUS.md','FINAL_SCIENTIFIC_TABLES.md','Q1_MANUSCRIPT_RESULTS_REVISION.md','REVIEWER_RESPONSE_MATRIX.md','FINAL_READINESS_REPORT.md']
assert all((H/n).exists() for n in required)
prior=json.loads((D/'research_evaluation/ai_independent_part2_v1/AI_REPRODUCIBILITY_MANIFEST.json').read_text())
checks=[]
for n,expected in prior['files'].items():
 p=AI/n[3:] if n.startswith('ai/') else D/n;assert p.exists() and sha(p)==expected;checks.append(n)
if (H/'live_campaign/configuration.json').exists():
 assert (H/'live_campaign/completion.json').exists(),'Live campaign is still running; do not freeze changing raw files'
 import runpy
 runpy.run_path(str(H/'scripts/mark_collection_complete.py'))
 runpy.run_path(str(H/'scripts/archive_raw.py'))
files={};findings=[]
patterns={'url_userinfo':re.compile(r'https?://[^/\s]+:[^/@\s]+@',re.I),'aws_access_key':re.compile(r'AKIA[0-9A-Z]{16}'),'github_token':re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}'),'postgres_connection_uri':re.compile(r'postgres(?:ql)?(?:\+\w+)?://[^\s\x22\x27]+',re.I),'private_key_material':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),'bearer_credential':re.compile(r'(?i)authorization[\x22\x27]?\s*[:=]\s*[\x22\x27]?Bearer\s+[A-Za-z0-9_.-]{16,}')}
for p in sorted(H.rglob('*')):
 if not p.is_file() or any(x in ['.plot_deps','.runtime','__pycache__'] for x in p.relative_to(H).parts) or p.name=='REPRODUCIBILITY_MANIFEST.json' or p.name.startswith(('ollama-server','finalizer','resume-ollama','resume-finalizer')) or p.name=='live_campaign_progress.jsonl':continue
 name=p.relative_to(H).as_posix();files[name]={'sha256':sha(p),'bytes':p.stat().st_size}
 if p.suffix in ['.json','.jsonl','.csv','.md','.log','.py','.ps1']:
  text=p.read_text(encoding='utf-8-sig',errors='replace')
  for label,regex in patterns.items():
   # Do not reproduce captured values. Source-code regex declarations are not credentials.
   if regex.search(text) and p.name!='seal.py':findings.append({'path':name,'pattern':label,'action':'manual review required; matched values withheld'})
large=[{'path':n,'bytes':r['bytes']} for n,r in files.items() if r['bytes']>20_000_000]
status=json.loads((H/'analysis_status.json').read_text())
info={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'classification':'Exploratory and engineering evidence; not human-validated confirmatory results','source':{label:{'base_commit':git(repo,'rev-parse','HEAD'),'branch':git(repo,'branch','--show-current'),'working_tree':git(repo,'status','--short','--untracked-files=no'),'meaning':'Uncommitted source identified by individual hashes; no deployment or commit created'} for label,repo in [('dao',D),('ai',AI)]},'previous_manifest_verified_files':len(checks),'counts':status,'human_annotations':0,'model_configurations':['live_campaign/configuration.json','b1_configuration.json','b2_configuration.json','b2_smoke_configuration.json','versions/v1_interrupted/configuration.json'],'files':files,'application_source_hashes':{str(p.relative_to(AI)).replace('\\','/'):sha(p) for p in (AI/'app').rglob('*.py')},'security_scan':{'high_confidence_patterns':list(patterns),'findings':findings,'credentials_or_private_environment_files_included':False,'scope':'Pattern scan plus explicit exclusion; not a comprehensive security audit'},'large_artifacts_over_20MB':large,'excluded':'Manifest itself, private environment files, isolated plotting packages, bytecode, temporary fixture directory and volatile Ollama daemon/finalizer/progress logs. Those logs stay local and ignored. Model call records and failure outputs are included.'}
(H/'REPRODUCIBILITY_MANIFEST.json').write_text(json.dumps(info,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
for name,row in files.items():assert sha(H/name)==row['sha256']
print(json.dumps({'manifest_files':len(files),'prior_hashes_verified':len(checks),'security_pattern_findings':len(findings),'large_artifacts':len(large),'records':status['benchmark_records']}))
