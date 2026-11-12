"""B1-only checkpoint path: does not need PostgreSQL; no gold, retrieval, or tools."""
import asyncio,datetime,hashlib,json,logging,os,random,selectors,time
from pathlib import Path
from unittest.mock import patch
import httpx
import adapters
from run import HERE,ROOT,MODELS,OPTIONS,DEADLINE,CONCURRENCY,safe,save,sha
from app.model.config.settings import settings
async def main():
 cases=json.loads((ROOT/'exploratory_frozen_v2/remaining_unexposed_questions.json').read_text(encoding='utf8'));assert len(cases)==133
 async with httpx.AsyncClient(timeout=20,trust_env=False) as client:
  tags=(await client.get(settings.ollama_base_url+'/api/tags')).raise_for_status().json()
 inventory={m['name']:m['digest'] for m in tags['models']};assert all(m in inventory for m in MODELS)
 config={'condition':'B1','models':{m:inventory[m] for m in MODELS},'options':OPTIONS,'deadline_seconds':DEADLINE,'concurrency':CONCURRENCY,'questions_sha256':sha(ROOT/'exploratory_frozen_v2/remaining_unexposed_questions.json'),'n':133,'human_reviewed':False,'gold_loaded':False,'sql_connections':0,'tool_access':False,'runner_sha256':sha(__file__),'adapter_sha256':sha(adapters.__file__)}
 path=HERE/'b1_configuration.json'
 if path.exists():assert json.loads(path.read_text())==config
 else:save('b1_configuration.json',config)
 raw=HERE/'raw/responses.jsonl';done=set()
 if raw.exists():done={(r['id'],r['model'],r['condition']) for r in map(json.loads,raw.read_text(encoding='utf8').splitlines())}
 original=httpx.AsyncClient.send
 async def send(client,request,*a,**kw):
  obs=adapters.OBS.get()
  if request.url.path!='/api/chat' or obs is None:return await original(client,request,*a,**kw)
  payload=json.loads(request.content);payload.update(model=obs['model'],options=dict(OPTIONS),stream=False,think=False,keep_alive='30m')
  assert 'tools' not in payload
  request=httpx.Request(request.method,request.url,headers=request.headers,content=json.dumps(payload).encode(),extensions=request.extensions);request.headers['content-length']=str(len(request.content))
  record={'path':'/api/chat','request_sha256':hashlib.sha256(request.content).hexdigest(),'request':payload};obs['provider_calls'].append(record);t=time.perf_counter()
  try:
   response=await original(client,request,*a,**kw);record.update(http=response.status_code,response=response.json());return response
  except BaseException as e:record['error']=type(e).__name__;raise
  finally:record['ms']=(time.perf_counter()-t)*1000
 sem=asyncio.Semaphore(CONCURRENCY);count=len(done)
 with patch.object(httpx.AsyncClient,'send',send),raw.open('a',encoding='utf8') as out:
  async def attempt(case,model):
   nonlocal count
   if (case['id'],model,'B1') in done:return
   async with sem:
    obs={'model':model,'provider_calls':[],'tool_metrics':[],'extractions':[]};token=adapters.OBS.set(obs);t=time.perf_counter();stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
     async with asyncio.timeout(DEADLINE):result=await adapters.single.run(case,None,False)
     error=None
    except Exception as e:result={'answer':None,'status':'failed','sources':[],'output_origin':'no_final_answer'};error=type(e).__name__+': '+str(e)[:120]
    finally:adapters.OBS.reset(token)
    row={'id':case['id'],'question':case['question'],'category':case['category'],'scope_label':case['scope_label'],'model':model,'condition':'B1','started_utc':stamp,'wall_ms':(time.perf_counter()-t)*1000,'error':error,**result,'provider_calls':obs['provider_calls'],'tool_metrics':[],'extractions':[],'runner':'b1_without_database.py'}
    out.write(json.dumps(safe(row),default=str,ensure_ascii=False)+'\n');out.flush();os.fsync(out.fileno());count+=1
    if count%10==0:print(json.dumps({'completed':count,'model':model,'id':case['id'],'status':row['status']}),flush=True)
  for model in MODELS:
   order=list(cases);random.Random(911).shuffle(order)
   await asyncio.gather(*(attempt(case,model) for case in order))
 save('b1_completion.json',{'records':count,'planned_records':266,'models':MODELS,'human_reviewed':False})
if __name__=='__main__':
 logging.basicConfig(level=logging.ERROR);asyncio.run(main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
