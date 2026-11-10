"""Resumable real-model smoke/benchmark runner. Never reads ground_truth.json.

Use --phase smoke first. Full execution requires quality.release_status == ready.
All governance SQL is read-only. Chain tools replay the captured real snapshot
in both tool-equipped variants, explicitly recorded as evidence replay.
"""
import argparse,asyncio,contextlib,hashlib,json,logging,os,platform,random,re,time
from pathlib import Path
from unittest.mock import patch
import httpx
from psycopg_pool import AsyncConnectionPool
from langchain_core.utils.function_calling import convert_to_openai_tool
from app.model.config.settings import settings
from app.business.rag.service import RagService
from app.business.mcp.context import ExecutionContext
from app.business.agents.tools import build_tools
from app.business.agents.workflow import MultiAgentWorkflow
from app.business.agents.question_planner import plan_question_batch
from app.business.agents.blockchain import BlockchainVerificationAgent
import app.business.agents.workflow as wf
import app.business.agents.synthesis as syn
import app.business.agents.tools as toolmod

ROOT=Path(__file__).resolve().parents[1]
SMOKE=['DB-001','PDF-005','MS-001','UA-001']
VARIANTS=['B1','B2','B3','B4']
REF=re.compile(r'\[((?:D|G|B)\d+)\]')

def clean(obj):
    if isinstance(obj,str):
        return re.sub(r'(?i)https?://\S+|0x[0-9a-f]{40}(?![0-9a-f])','[redacted]',obj)
    if isinstance(obj,list):return [clean(x) for x in obj]
    if isinstance(obj,dict):return {k:clean(v) for k,v in obj.items()}
    return obj

class UncheckedRefs(list):
    def __bool__(self):return True

def unchecked(answer,evidence):
    return {'valid':True,'cited':UncheckedRefs(dict.fromkeys(REF.findall(answer or ''))),'unknown':[]}

@contextlib.contextmanager
def ablation(enabled):
    with contextlib.ExitStack() as stack:
        if enabled:
            for mod,name,replacement in [(wf,'verify_citations',unchecked),(syn,'verify_citations',unchecked),
                (toolmod,'check_citations',unchecked),(wf,'supported_amounts',lambda *a:True),
                (syn,'supported_amounts',lambda *a:True),(wf,'blocking_flags',lambda *a:[])]:
                stack.enter_context(patch.object(mod,name,replacement))
        yield

async def chat(client,messages,tools=None):
    body={'model':settings.ollama_chat_model,'stream':False,'think':False,'messages':messages,
          'options':{'seed':42,'temperature':0.6,'num_ctx':8192,'num_predict':1536}}
    if tools:body['tools']=tools
    response=await client.post(settings.ollama_base_url+'/api/chat',json=body)
    response.raise_for_status()
    return response.json()['message']

async def single(case,context,with_tools):
    tools=build_tools(context) if with_tools else {}
    prompt='Answer only the request, briefly. Never invent unavailable governance facts. '
    prompt+='Use permitted read-only tools and cite returned evidence.' if with_tools else 'You have no retrieval or DAO records; acknowledge unknown facts.'
    messages=[{'role':'system','content':prompt},
              {'role':'user','content':json.dumps({'question':case['question'],'scope':{'dao_id':case['dao'],'proposal_id':case['proposal']}})}]
    sources=[]; events=[]
    async with httpx.AsyncClient(timeout=100,trust_env=False) as client:
        for step in range(6):
            message=await chat(client,messages,[convert_to_openai_tool(t) for t in tools.values()] if tools else None)
            messages.append(message)
            calls=message.get('tool_calls',[])
            if not calls:
                text=re.sub(r'<think>.*?</think>','',message.get('content',''),flags=re.S).strip()
                if not text:raise RuntimeError('NoVisibleAnswer')
                return {'answer':text,'status':'completed','sources':sources,'tool_events':events,'warnings':[],'output_origin':'real_model'}
            if not with_tools:raise RuntimeError('UnexpectedToolRequest')
            for call in calls:
                fn=call['function']; name=fn['name']; args=fn.get('arguments',{})
                if isinstance(args,str):args=json.loads(args)
                start=time.perf_counter()
                try:
                    if name not in tools:raise PermissionError('Tool not permitted')
                    if args.get('dao_id',case['dao'])!=case['dao']:raise PermissionError('DAO scope denied')
                    if args.get('proposal_id',case['proposal'])!=case['proposal']:raise PermissionError('Proposal scope denied')
                    value=await tools[name].ainvoke(args)
                    sid='G'+str(len(sources)+1)
                    sources.append({'source_id':sid,'content':json.dumps(value,default=str),'tool':name})
                    result={'source_id':sid,'result':value}
                    status='completed'
                except Exception as exc:
                    result={'error':type(exc).__name__}; status='failed'
                events.append({'name':name,'arguments':clean(args),'status':status,'ms':(time.perf_counter()-start)*1000})
                messages.append({'role':'tool','tool_name':name,'content':json.dumps(result,default=str)})
        return {'answer':None,'status':'failed','sources':sources,'tool_events':events,'warnings':['ToolLoopLimit'],'output_origin':'real_model_unsuccessful'}

async def run_case(case,variant,context):
    if case['permission']=='no_wallet':
        async with httpx.AsyncClient(timeout=15,trust_env=False) as client:
            r=await client.post(settings.dao_backend_url+'/v1/ai/assistant/ask',json={'proposalId':case['proposal'],'question':[case['question']]})
        return {'answer':None,'status':'denied' if r.status_code==401 else 'failed','http_status':r.status_code,
                'sources':[],'warnings':[],'output_origin':'real_http_authorization_gate_no_model',
                'disclosure_bytes':None,'disclosure_assessment':'Response body requires explicit review; status alone does not measure disclosure'}
    if variant in ['B1','B2']:return await single(case,context,variant=='B2')
    with ablation(variant=='B3'):
        plan=await plan_question_batch(context.rag.ollama,case['question'])
        if plan.needs_clarification:raise RuntimeError('PlannerClarification')
        output=await MultiAgentWorkflow(context,concurrency=1).run([p.question for p in plan.questions],
            question_plan=plan.questions,dao_id=case['dao'],proposal_id=case['proposal'],top_k=4,original_request=case['question'])
        response=output.final_response
        data=response.model_dump(mode='json') if response else {}
        warnings=data.get('errors',[])
        return {'answer':data.get('answer'),'status':data.get('status','failed'),'workflow_status':output.status,
                'sources':data.get('cited_sources',[]),'warnings':warnings,'spans':output.trace,'workflow_metrics':output.metrics,
                'output_origin':'fallback_or_mixed' if warnings or not data.get('model_used') else 'real_model',
                'worker_results':[r.model_dump(mode='json') for r in output.results]}

async def main(args):
    quality=json.loads((ROOT/'quality.json').read_text())
    if args.phase=='full' and quality['release_status']!='ready':
        raise RuntimeError('QualityGateBlocked: 200 verified cases and independent absence review required; see quality.json')
    cases=json.loads((ROOT/'questions_verified.json').read_text())
    if args.phase=='smoke':cases=[c for c in cases if c['id'] in SMOKE]
    snapshot=json.loads((ROOT/'evidence/snapshot.json').read_text())
    out=ROOT/'raw_results'/args.phase; out.mkdir(parents=True,exist_ok=True)
    config={'phase':args.phase,'cases':[c['id'] for c in cases],'variants':VARIANTS,'model':settings.ollama_chat_model,
            'fast_model':settings.ollama_fast_model,'embedding_model':settings.ollama_embed_model,'seed':42,'temperature':0.6,
            'context':8192,'timeout_seconds':200,'single_agent_max_model_turns':6,'concurrency':1,
            'source_mode':'Live read-only PostgreSQL/RAG; frozen real chain-response replay for B2/B3/B4',
            'gold_read_by_runner':False,'snapshot_sha256':hashlib.sha256((ROOT/'evidence/snapshot.json').read_bytes()).hexdigest(),
            'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'questions_sha256':hashlib.sha256((ROOT/'questions_verified.json').read_bytes()).hexdigest(),
            'app_generation_limits':'1536 then 3072 retry; planner distinct 3072 limit and temperature 0; observe provider options',
            'infrastructure':snapshot['infrastructure']}
    manifest=out/'config.json'
    if manifest.exists():
        if json.loads(manifest.read_text())!=config:raise RuntimeError('Resume configuration mismatch; preserve original run')
    else:manifest.write_text(json.dumps(config,indent=2),encoding='utf8')
    path=out/'responses.jsonl'
    previous=[json.loads(s) for s in path.read_text().splitlines()] if path.exists() else []
    done={(r['id'],r['variant']) for r in previous}
    pool=AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on'},min_size=1,max_size=4,open=False)
    await pool.open(wait=True,timeout=10)
    context=ExecutionContext(pool,RagService(pool),True)
    async def replay(self,dao_id,proposal_id):
        for label,row in snapshot['database'].items():
            if row['id']==proposal_id and row['dao_id']==dao_id:return snapshot['blockchain'][label]
        raise PermissionError('Snapshot scope not permitted')
    send=httpx.AsyncClient.send
    calls=[]
    async def measured_send(self,request,*a,**kw):
        begin=time.perf_counter()
        response=await send(self,request,*a,**kw)
        if request.url.path in ['/api/chat','/api/embed','/api/embeddings']:
            payload=json.loads(request.content)
            calls.append({'path':request.url.path,'model':payload.get('model'),'options':payload.get('options'),
              'prompt_sha256':hashlib.sha256(request.content).hexdigest(),'ms':(time.perf_counter()-begin)*1000,
              'http':response.status_code,'response':response.json()})
        return response
    try:
        with patch.object(BlockchainVerificationAgent,'snapshot',replay),patch.object(httpx.AsyncClient,'send',measured_send),path.open('a',encoding='utf8') as file:
            rng=random.Random(43)
            for case in cases:
                variants=list(VARIANTS); rng.shuffle(variants)
                for variant in variants:
                    if (case['id'],variant) in done:continue
                    calls.clear(); start=time.perf_counter(); error=None
                    try:
                        async with asyncio.timeout(200):result=await run_case(case,variant,context)
                    except Exception as exc:
                        error=type(exc).__name__+': '+str(exc)[:180]
                        result={'status':'failed','answer':None,'sources':[],'output_origin':'no_final_answer_preserved_provider_attempts'}
                    row={'id':case['id'],'category':case['category'],'variant':variant,'question':case['question'],
                         'wall_ms':(time.perf_counter()-start)*1000,'error':error,**result,'provider_calls':list(calls)}
                    file.write(json.dumps(clean(row),ensure_ascii=False,default=str)+'\n'); file.flush();os.fsync(file.fileno())
                    print(case['id'],variant,result['status'],round(row['wall_ms']),flush=True)
    finally:await pool.close()

if __name__=='__main__':
    logging.basicConfig(level=logging.ERROR)
    parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['smoke','full'],default='smoke')
    asyncio.run(main(parser.parse_args()),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
