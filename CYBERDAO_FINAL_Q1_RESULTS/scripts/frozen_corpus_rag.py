"""Plain RAG against archived actual page chunks with real Ollama embedding.
Separate storage adapter from live PostgreSQL: labelled frozen-corpus evaluation.
"""
import asyncio,datetime,hashlib,json,logging,math,os,random,selectors,time,sys
from pathlib import Path
from unittest.mock import patch
import httpx
import adapters
from run import HERE,ROOT,MODELS,OPTIONS,DEADLINE,CONCURRENCY,safe,save,sha
from app.model.config.settings import settings
async def main():
 cases=json.loads((ROOT/'exploratory_frozen_v2/remaining_unexposed_questions.json').read_text(encoding='utf8'))
 smoke='--smoke' in sys.argv
 if smoke:
  cases=json.loads((ROOT/'harness_validation_v1/development_questions.json').read_text(encoding='utf8'))
  for case in cases:case.update(scope_label='training',category='development')
 sourcefile=HERE/'evidence/source_records.json';source=json.loads(sourcefile.read_text(encoding='utf8'))
 corpus={label:rows['search_proposal_evidence'].get('data',{}).get('evidence',[]) for label,rows in source.items()}
 corpus={label:list({s.get('chunk_key',s['content']):s for s in rows}.values()) for label,rows in corpus.items()}
 async with httpx.AsyncClient(timeout=180,trust_env=False) as client:
  tags=(await client.get(settings.ollama_base_url+'/api/tags')).raise_for_status().json();inventory={m['name']:m['digest'] for m in tags['models']}
  configuration={'condition':'B2','source_mode':'Frozen actual verified page chunks from live SQL/RAG preflight; real embedding and cosine retrieval, not production PostgreSQL retrieval','models':{m:inventory[m] for m in MODELS},'embedding_model':settings.ollama_embed_model,'embedding_digest':inventory[settings.ollama_embed_model],
  'source_file_sha256':sha(sourcefile),'options':OPTIONS,'deadline_seconds':DEADLINE,'generation_http_timeout_seconds':100,'concurrency':CONCURRENCY,'questions_sha256':sha(ROOT/('harness_validation_v1/development_questions.json' if smoke else 'exploratory_frozen_v2/remaining_unexposed_questions.json')),'n':len(cases),'human_reviewed':False,'gold_loaded':False,'top_k':4,'corpus_chunk_counts':{k:len(v) for k,v in corpus.items()},'query_embeddings':'Computed once, checkpointed and reused across models; embedding latency reported separately; generation wall includes neither embedding nor corpus setup','runner_sha256':sha(__file__),'prompt':adapters.single.PROMPT+'Answer from the retrieved document excerpts only. You have no database or chain tool access. If the excerpts do not establish the answer, abstain.'}
  config_name='b2_smoke_configuration.json' if smoke else 'b2_configuration.json'
  path=HERE/config_name
  if path.exists():assert json.loads(path.read_text())==configuration
  else:save(config_name,configuration)
  cache_name='raw/retrieval_smoke_cache.json' if smoke else 'raw/retrieval_cache.json'
  cachefile=HERE/cache_name;cache=json.loads(cachefile.read_text()) if cachefile.exists() else {'chunks':{},'queries':{},'setup_calls':[]}
  async def embed(text):
   t=time.perf_counter();body={'model':settings.ollama_embed_model,'input':[text]}
   r=await client.post(settings.ollama_base_url+'/api/embed',json=body);r.raise_for_status();data=r.json()
   return {'vector':data['embeddings'][0],'ms':(time.perf_counter()-t)*1000,'tokens':data.get('prompt_eval_count'),'request_sha256':hashlib.sha256(json.dumps(body).encode()).hexdigest()}
  for label,chunks in corpus.items():
   for chunk in chunks:
    key=hashlib.sha256(chunk['content'].encode()).hexdigest()
    if key not in cache['chunks']:cache['chunks'][key]=await embed(chunk['content']);save(cache_name,cache)
  for i,c in enumerate(cases):
   if c['id'] not in cache['queries']:
    try:cache['queries'][c['id']]=await embed(c['question']) if corpus[c['scope_label']] else {'vector':None,'ms':0,'tokens':0,'reason':'No linked PDF corpus'}
    except Exception as exc:cache['queries'][c['id']]={'error':type(exc).__name__,'vector':None}
    save(cache_name,cache)
   if (i+1)%25==0:print('query embeddings checkpoint',i+1,flush=True)
 # Embedding and corpus setup finish before generation, avoiding uncontrolled model swapping between concurrent attempts.
 original=httpx.AsyncClient.send
 async def measured(client,request,*a,**kw):
  obs=adapters.OBS.get()
  if request.url.path!='/api/chat' or obs is None:return await original(client,request,*a,**kw)
  payload=json.loads(request.content);payload.update(model=obs['model'],options=dict(OPTIONS),stream=False,think=False,keep_alive='30m')
  assert 'tools' not in payload
  request=httpx.Request(request.method,request.url,headers=request.headers,content=json.dumps(payload).encode(),extensions=request.extensions);request.headers['content-length']=str(len(request.content))
  record={'path':'/api/chat','request_sha256':hashlib.sha256(request.content).hexdigest(),'request':payload};obs['provider_calls'].append(record);t=time.perf_counter()
  try:r=await original(client,request,*a,**kw);record.update(http=r.status_code,response=r.json());return r
  except BaseException as e:record['error']=type(e).__name__;raise
  finally:record['ms']=(time.perf_counter()-t)*1000
 def cosine(a,b):return sum(x*y for x,y in zip(a,b))/(math.sqrt(sum(x*x for x in a))*math.sqrt(sum(x*x for x in b)))
 raw=HERE/'raw'/('frozen_rag_smoke.jsonl' if smoke else 'frozen_rag_responses.jsonl');done=set()
 if raw.exists():done={(r['id'],r['model']) for r in map(json.loads,raw.read_text(encoding='utf8').splitlines())}
 sem=asyncio.Semaphore(CONCURRENCY);count=len(done)
 with patch.object(httpx.AsyncClient,'send',measured),raw.open('a',encoding='utf8') as out:
  async def attempt(c,model):
   nonlocal count
   if (c['id'],model) in done:return
   async with sem:
    t=time.perf_counter();obs={'model':model,'provider_calls':[]};token=adapters.OBS.set(obs);q=cache['queries'][c['id']];sources=[];stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
     async with asyncio.timeout(DEADLINE):
      if q.get('error'):raise RuntimeError('Query embedding failed: '+q['error'])
      ranked=[]
      for chunk in corpus[c['scope_label']]:
       key=hashlib.sha256(chunk['content'].encode()).hexdigest();ranked.append((cosine(q['vector'],cache['chunks'][key]['vector']),chunk))
      for index,(score,chunk) in enumerate(sorted(ranked,key=lambda x:-x[0])[:4],1):sources.append({**chunk,'source_id':'D'+str(index),'score':score})
      messages=[{'role':'system','content':configuration['prompt']},{'role':'user','content':json.dumps({'question':c['question'],'scope':{'dao_id':c['dao'],'proposal_id':c['proposal']},'retrieved_evidence':{'evidence':sources}},default=str)}]
      async with httpx.AsyncClient(timeout=100,trust_env=False) as client:
       response=await client.post(settings.ollama_base_url+'/api/chat',json={'model':model,'messages':messages,'stream':False,'think':False});response.raise_for_status();answer=response.json()['message'].get('content','').strip()
      result={'answer':answer or None,'status':'completed' if answer else 'failed','output_origin':'real_model'};error=None
    except Exception as exc:result={'answer':None,'status':'failed','output_origin':'no_final_answer'};error=type(exc).__name__+': '+str(exc)[:120]
    finally:adapters.OBS.reset(token)
    row={'id':c['id'],'question':c['question'],'category':c['category'],'scope_label':c['scope_label'],'model':model,'condition':'B2','source_mode':configuration['source_mode'],'started_utc':stamp,'wall_ms':(time.perf_counter()-t)*1000,'retrieval_embedding_ms':q.get('ms'),'retrieval_embedding_tokens':q.get('tokens'),'error':error,**result,'sources':sources,'provider_calls':obs['provider_calls'],'extractions':[],'tool_metrics':[]}
    out.write(json.dumps(safe(row),default=str,ensure_ascii=False)+'\n');out.flush();os.fsync(out.fileno());count+=1
    if smoke or count%10==0:print(json.dumps({'completed':count,'model':model,'id':c['id'],'status':row['status']}),flush=True)
  for model in MODELS:
   order=list(cases);random.Random(911).shuffle(order);await asyncio.gather(*(attempt(c,model) for c in order))
 save('b2_smoke_completion.json' if smoke else 'b2_completion.json',{'records':count,'planned_records':len(cases)*2,'models':MODELS,'human_reviewed':False})
if __name__=='__main__':
 logging.basicConfig(level=logging.ERROR);asyncio.run(main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))

