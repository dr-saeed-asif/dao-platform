"""Real-model checkpointed exploratory campaign; no gold access."""
import asyncio,contextlib,datetime,hashlib,importlib.util,json,logging,os,platform,random,selectors,sys,time
from pathlib import Path
from unittest.mock import patch
import httpx
from psycopg import sql
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings
from app.business.rag.service import RagService
from app.business.mcp.context import ExecutionContext
from app.business.agents.blockchain import BlockchainVerificationAgent
from app.business.agents.tools import build_tools
from langchain_core.utils.function_calling import convert_to_openai_tool
import adapters
HERE=Path(__file__).resolve().parents[1];DAO=HERE.parent;ROOT=DAO/'research_evaluation';AI=Path.cwd()
OPTIONS={'seed':42,'temperature':0.6,'num_ctx':8192,'num_predict':1536,'top_p':0.8,'top_k':20,'repeat_penalty':1.1}
MODELS=['qwen3:0.6b','qwen3:4b-instruct'];CONDITIONS=['B1','B2','B3','B4','A1','A2','A12'];DEADLINE=200;CONCURRENCY=2
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,value):
 p=HERE/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,ensure_ascii=False,indent=2,default=str)+'\n',encoding='utf8')
def safe(x):
 import re
 if isinstance(x,str):
  x=re.sub(r'(?i)(?:postgres(?:ql)?(?:\+\w+)?://|https?://)\S+','[endpoint redacted]',x)
  x=re.sub(r'0x[0-9a-fA-F]{40}(?![0-9a-fA-F])','[wallet-or-contract redacted]',x)
  return re.sub(r'(?i)[a-z0-9_.+-]+@[a-z0-9.-]+\.[a-z]{2,}','[email redacted]',x)
 if isinstance(x,dict):return {k:safe(v) for k,v in x.items()}
 if isinstance(x,(tuple,list)):return [safe(v) for v in x]
 return x
class FrozenPool:
 def __init__(self,pool,snapshot):self.pool,self.snapshot=pool,snapshot
 @contextlib.asynccontextmanager
 async def connection(self,timeout=None):
  async with self.pool.connection(timeout=timeout) as c:
   async with c.transaction():
    await c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    await c.execute(sql.SQL('SET TRANSACTION SNAPSHOT {}').format(sql.Literal(self.snapshot)))
    yield c
class Recorder:
 async def record(self,value):
  from dataclasses import asdict
  if adapters.OBS.get() is not None:adapters.OBS.get()['tool_metrics'].append(asdict(value))
async def fingerprints(c):
 names=await(await c.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).fetchall();result={}
 for (name,) in names:
  query=sql.SQL("SELECT count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {} t").format(sql.Identifier('public',name))
  n,h=await(await c.execute(query)).fetchone();result[name]={'rows':n,'aggregate_digest':h}
 return result
async def main():
 cases=json.loads((ROOT/'exploratory_frozen_v2/remaining_unexposed_questions.json').read_text(encoding='utf8'))
 assert len(cases)==len({c['id'] for c in cases})==133
 async with httpx.AsyncClient(timeout=20,trust_env=False) as client:
  tags=(await client.get(settings.ollama_base_url+'/api/tags')).raise_for_status().json()
  version=(await client.get(settings.ollama_base_url+'/api/version')).raise_for_status().json()
 inventory={m['name']:m['digest'] for m in tags['models']};assert all(m in inventory for m in MODELS+[settings.ollama_embed_model])
 pool=AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on','autocommit':True},min_size=2,max_size=12,open=False)
 await pool.open(wait=True,timeout=20)
 try:
  async with pool.connection() as exporter:
   async with exporter.transaction():
    await exporter.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    snapshot=(await(await exporter.execute('SELECT pg_export_snapshot()')).fetchone())[0]
    fp=await fingerprints(exporter)
    chainfile=ROOT/'harness_validation_v1/chain_snapshot.json';chain=json.loads(chainfile.read_text(encoding='utf8'))
    save('evidence/chain_snapshot.json',chain)
    async def replay(self,dao_id,proposal_id):
     if not self.context.operator_verified:raise PermissionError('Operator scope required')
     for record in chain:
      if record['dao_id']==dao_id and record['proposal_id']==proposal_id:return record
     raise PermissionError('Frozen chain scope unavailable')
    rag=RagService(FrozenPool(pool,snapshot));rag.recorder=Recorder();context=ExecutionContext(rag.pool,rag,True)
    tools=build_tools(context)
    schemas={n:convert_to_openai_tool(t) for n,t in tools.items()}
    save('evidence/tool_schemas.json',schemas)
    assert schemas=={n:convert_to_openai_tool(t) for n,t in adapters.wf.MultiAgentWorkflow(context).tools.items()}
    source_files={str(p.relative_to(AI)).replace('\\','/'):sha(p) for base in ['app/business/agents','app/business/rag','app/business/governance','app/business/mcp','app/model/database'] for p in (AI/base).rglob('*.py')}
    cfg={'classification':'Exploratory real-model comparison; AI-assisted reference labels; no human adjudication','confirmatory':False,
    'cohort_n':133,'cohort_sha256':sha(ROOT/'exploratory_frozen_v2/remaining_unexposed_questions.json'),'models':MODELS,'model_digests':{m:inventory[m] for m in MODELS},
    'embedding_model':settings.ollama_embed_model,'embedding_digest':inventory[settings.ollama_embed_model],
    'options_all_chat_stages':OPTIONS,'maximum_chat_calls_per_case':6,'deadline_seconds':DEADLINE,'concurrency':CONCURRENCY,'order_seed':911,
    'conditions':CONDITIONS,'definitions':{'B1':'LLM only, no evidence/tools','B2':'Plain document RAG, same indexed PDFs and embedder; no SQL or chain context','B3':'Single agent, same 22 permitted tools and canonical source normalization','B4':'Current full CyberDAO, all gates and deterministic extraction','A1':'B4 with five direct-answer helpers and budget_answer returning None','A2':'B4 with workflow and synthesis blocking_flags disabled; structural citation/currency gates retained','A12':'A1+A2','A_SQL':'Model-free parameterized governance SQL; limited applicability, no gold lookup','A_RAG':'Alias of B2; no repeated run'},
    'reference_answers_loaded_by_runner':False,'source_files':source_files,'table_fingerprints':fp,
    'chain_sha256':sha(chainfile),'chain_policy':'Archived actual corrected-verifier observations from 2026-11-10 replayed unchanged to tool/full conditions; not a fresh RPC experiment',
    'sql_policy':'One live exported read-only MVCC snapshot; table fingerprints frozen; source values archived by scope; resume requires matching fingerprints',
    'transport_privilege':'Trusted research in-process operator context; not a wallet/C4 boundary test','prompts':'Architecture-specific, exact payloads retained without gold',
    'historical_comparison':'0.6B model, seed42,temp0.6,ctx8192,predict1536 retained; new matched stage normalization, new baseline labels, concurrent execution differ from historical studies',
    'hardware':{'platform':platform.platform(),'python':platform.python_version(),'ollama':version},
    'runner_sha256':sha(__file__),'adapters_sha256':sha(Path(__file__).with_name('adapters.py'))}
    if (HERE/'configuration.json').exists():assert json.loads((HERE/'configuration.json').read_text())==cfg,'Resume configuration or source mismatch'
    else:save('configuration.json',cfg)
    # Freeze authoritative permitted source records, not answers. No generative inference.
    source={}
    for label in dict.fromkeys(c['scope_label'] for c in cases):
     c=next(c for c in cases if c['scope_label']==label);scope={'dao_id':c['dao'],'proposal_id':c['proposal']}
     source[label]={}
     for name,args in [('get_proposal',scope),('get_proposal_voting_facts',scope),('count_dao_proposals',{'dao_id':c['dao']}),('list_dao_proposals',{'dao_id':c['dao'],'limit':100}),('search_proposal_evidence',{**scope,'question':'Summarize the document and budget deliverables risks','top_k':4})]:
      source[label][name]=await tools[name].ainvoke(args)
    save('evidence/source_records.json',safe(source))
    checks={'same_22_tool_schemas':len(schemas)==22,'frozen_sql_read_only':True,'source_tool_statuses':{label:{n:r.get('success') for n,r in rows.items()} for label,rows in source.items()},'model_inventory':inventory,'chain_scopes':len(chain),'chat_calls':0}
    save('preflight.json',checks)
    if '--prepare' in sys.argv:return
    assert (HERE/'static_checks.json').exists() and json.loads((HERE/'static_checks.json').read_text())['passed'],'Static adapter checks required'
    original_send=httpx.AsyncClient.send
    async def measured(client,request,*args,**kwargs):
     obs=adapters.OBS.get()
     if request.url.path not in ('/api/chat','/api/embed','/api/embeddings') or obs is None:return await original_send(client,request,*args,**kwargs)
     payload=json.loads(request.content)
     if request.url.path=='/api/chat':
      if sum(c['path']=='/api/chat' for c in obs['provider_calls'])>=6:raise RuntimeError('Prospective shared six-chat budget exhausted')
      payload.update(model=obs['model'],options=dict(OPTIONS),think=False,stream=False,keep_alive='30m')
      request=httpx.Request(request.method,request.url,headers=request.headers,content=json.dumps(payload).encode(),extensions=request.extensions)
      request.headers['content-length']=str(len(request.content))
     started=time.perf_counter();record={'path':request.url.path,'request_sha256':hashlib.sha256(request.content).hexdigest(),'request':payload};obs['provider_calls'].append(record)
     try:
      response=await original_send(client,request,*args,**kwargs);record.update(http=response.status_code,response=response.json());return response
     except BaseException as exc:record['error']=type(exc).__name__;raise
     finally:record['ms']=(time.perf_counter()-started)*1000
    development=json.loads((ROOT/'harness_validation_v1/development_questions.json').read_text(encoding='utf8'))
    smoke='--smoke' in sys.argv;run_cases=development if smoke else cases
    rawfile=HERE/'raw'/('development_smoke.jsonl' if smoke else 'responses.jsonl');done=set()
    if rawfile.exists():done={(r['id'],r['model'],r['condition']) for r in map(json.loads,rawfile.read_text(encoding='utf8').splitlines())}
    sem=asyncio.Semaphore(CONCURRENCY);count=len(done)
    async def attempt(c,model,name,out):
     nonlocal count
     if (c['id'],model,name) in done:return
     async with sem:
      observed={'model':model,'provider_calls':[],'tool_metrics':[],'extractions':[]};tok=adapters.OBS.set(observed);start=time.perf_counter()
      try:
       async with asyncio.timeout(DEADLINE):result=await adapters.run(c,name,context)
       error=None
      except Exception as exc:result={'answer':None,'status':'failed','sources':[],'output_origin':'no_final_answer'};error=type(exc).__name__+': '+str(exc)[:160]
      finally:adapters.OBS.reset(tok)
      row={'id':c['id'],'question':c['question'],'category':c.get('category','development'),'scope_label':c.get('scope_label'),'model':model,'condition':name,'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'wall_ms':(time.perf_counter()-start)*1000,'error':error,**result,**{k:v for k,v in observed.items() if k!='model'}}
      out.write(json.dumps(safe(row),ensure_ascii=False,default=str)+'\n');out.flush();os.fsync(out.fileno());count+=1
      if smoke or count%10==0:print(json.dumps({'completed':count,'id':c['id'],'model':model,'condition':name,'status':row['status'],'ms':round(row['wall_ms'])}),flush=True)
    with patch.object(BlockchainVerificationAgent,'snapshot',replay),patch.object(httpx.AsyncClient,'send',measured),rawfile.open('a',encoding='utf8') as out:
     for model in MODELS:
      for name in CONDITIONS:
       order=list(run_cases);random.Random(911).shuffle(order)
       with adapters.condition(name):await asyncio.gather(*(attempt(c,model,name,out) for c in order))
    save('smoke_completion.json' if smoke else 'completion.json',{'completed_records':count,'planned_records':len(run_cases)*len(MODELS)*len(CONDITIONS),'cohort_n':len(run_cases),'human_validated':False,'source_files_unchanged':all(sha(AI/p)==h for p,h in source_files.items()),'finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 finally:await pool.close()
if __name__=='__main__':
 logging.basicConfig(level=logging.ERROR)
 try:asyncio.run(main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
 except BaseException as e:
  save('execution_blocker_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')+'.json',{'type':type(e).__name__,'message':safe(str(e)[:200])});raise
