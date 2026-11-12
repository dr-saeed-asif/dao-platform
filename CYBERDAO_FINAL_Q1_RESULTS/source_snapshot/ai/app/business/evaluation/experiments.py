"""Reproducible measured experiments; deterministic gold checks, no invented scores."""
import asyncio
import csv
import math
import statistics
import hashlib
import importlib.metadata
import io
import json
import re
import subprocess
from pathlib import Path
from time import perf_counter
from uuid import uuid4
import httpx
from app.business.agents.workflow import MultiAgentWorkflow
from app.business.agents.models import QuestionResult
from app.business.evaluation.tracing import utc_now, run_metrics
from app.business.mcp.context import ExecutionContext
from app.business.rag.service import RagService
from app.business.rag.ollama_answers import visible_answer
from app.model.config.settings import settings
from app.model.database.agent_observability import evaluation_row

MODES = ('single_llm','rag','multi_agent_rag','multi_agent_rag_blockchain')

def score(result, gold, mode):
    answer = (result.get('answer') or '').casefold()
    facts = gold.get('required_facts')
    expected = gold.get('expected_answer')
    fact_accuracy = sum(str(f).casefold() in answer for f in facts)/len(facts) if facts else None
    exact = re.sub(r'\W+', ' ',answer).strip() == re.sub(r'\W+', ' ',expected.casefold()).strip() if expected else None
    cites = set(result.get('citations',[]))
    available = {s['source_id'] for s in result.get('cited_sources',[])}
    required = set(gold.get('required_citations',[]))
    e = result.get('execution',{})
    expected_agent = gold.get('expected_agent')
    chain = (result.get('blockchain_verification') or {}).get('status')
    return dict(fact_match_accuracy=fact_accuracy, exact_match_accuracy=exact,
        citation_validity=len(cites & available)/len(cites) if cites else None,
        citation_gold_precision=len(cites & required)/len(cites) if cites and required else None,
        citation_gold_recall=len(cites & required)/len(required) if required else None,
        routing_accuracy=(result['agent']==expected_agent) if expected_agent and mode.startswith('multi_agent') else None,
        tool_success_rate=e.get('tool_successes',0)/e['tool_calls'] if e.get('tool_calls') else None,
        blockchain_accuracy=(chain==gold['expected_verification_status']) if gold.get('expected_verification_status') else None,
        blockchain_status=chain)

async def single_llm(question, rag):
    started, timestamp = perf_counter(), utc_now()
    payload = {}
    error = None
    try:
        async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
            response = await client.post(settings.ollama_base_url.rstrip('/')+'/api/chat',json={
                'model':settings.ollama_chat_model,'stream':False,'think':False,
                'messages':[{'role':'system','content':'Answer directly and briefly. You have no tools or DAO records. State uncertainty when private proposal facts are unknown. Do not fabricate private proposal data.'},{'role':'user','content':question}],
                'options':{'seed':42,'temperature':0.6,'num_predict':1024}})
            response.raise_for_status(); payload=response.json()
        content=visible_answer(payload)
        if not content: raise RuntimeError('No visible model answer returned')
    except Exception as exc:
        error=type(exc).__name__; content=None
    elapsed=(perf_counter()-started)*1000
    span=dict(span_id=str(uuid4()),kind='llm',name='ollama.single_llm',agent='single_llm',
        model=payload.get('model') or settings.ollama_chat_model, started_at=timestamp, completed_at=utc_now(),
        latency_ms=elapsed,status='failed' if error else 'completed',error_type=error,
        input_tokens=payload.get('prompt_eval_count'),output_tokens=payload.get('eval_count'))
    return QuestionResult(question_id='q1',question=question,agent='analysis', status='failed' if error else 'completed',
        answer=content, errors=[error] if error else [], model_used=span['model'],
        total_ms=elapsed,generation_ms=elapsed,input_tokens=span['input_tokens'],output_tokens=span['output_tokens'],
        execution=dict(started_at=timestamp,completed_at=span['completed_at'],latency_ms=elapsed,llm_ms=elapsed,
            input_tokens=span['input_tokens'],output_tokens=span['output_tokens'], tool_calls=0,tool_successes=0,
            tools=[],agents=['single_llm'],models=[span['model']],retries=0,trace=[span]))

async def experiment(pool, dataset, output, modes=MODES, repetitions=1):
    data=Path(dataset).read_bytes(); cases=json.loads(data)
    if not isinstance(cases,list) or not cases: raise ValueError('Dataset must be a nonempty JSON array')
    if any(not all(case.get(k) for k in ('id','dao_id','proposal_id','question')) for case in cases): raise ValueError('Each case needs id, dao_id, proposal_id and question')
    if any(mode not in MODES for mode in modes): raise ValueError('Unsupported experiment mode')
    if not 1 <= repetitions <= 20: raise ValueError('Repetitions must be 1-20')
    experiment_id=uuid4()
    try: revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True,stderr=subprocess.DEVNULL).strip()
    except Exception: revision=None
    manifest=dict(experiment_id=str(experiment_id),dataset_sha256=hashlib.sha256(data).hexdigest(),
        started_at=utc_now(),git_commit=revision,seed=42,temperature=0.6,
        chat_model=settings.ollama_chat_model,fast_model=settings.ollama_fast_model,
        embedding_model=settings.ollama_embed_model,concurrency=1,top_k=4,repetitions=repetitions,modes=list(modes),
        versions={p:importlib.metadata.version(p) for p in ('langgraph','langchain-core','httpx','psycopg')},
        scoring='Deterministic exact/fact matching and citation/routing/verification gold checks. Null means no applicable ground truth or measurement; not a semantic LLM-judge score.')
    source_hash=hashlib.sha256()
    for source in sorted(Path('app/business/agents').glob('*.py')):
        source_hash.update(str(source).encode()); source_hash.update(source.read_bytes())
    manifest['agent_source_sha256']=source_hash.hexdigest()
    async with httpx.AsyncClient(timeout=10,trust_env=False) as client:
        inventory=await client.get(settings.ollama_base_url.rstrip('/')+'/api/tags')
        inventory.raise_for_status()
        manifest['ollama_models']=[{k:m.get(k) for k in ('name','digest','details')} for m in inventory.json().get('models',[])]
    rag=RagService(pool); rows=[]
    for repeat in range(repetitions):
        for case in cases:
            for mode in modes:
                run_id=uuid4(); started=perf_counter()
                if mode=='single_llm': result=await single_llm(case['question'],rag)
                else:
                    workflow=MultiAgentWorkflow(ExecutionContext(pool,rag,True),concurrency=1)
                    run=await workflow.run([case['question']],dao_id=case['dao_id'],proposal_id=case['proposal_id'],strategy=mode,run_id=run_id)
                    result=run.results[0]
                value=result.model_dump(mode='json'); metrics=run_metrics([value],(perf_counter()-started)*1000)
                scoring=score(value,case,mode); config={**manifest,'case_id':case['id'],'repeat':repeat,'scores':scoring}
                async with pool.connection(timeout=5) as conn:
                    await evaluation_row(conn,run_id,mode,case['dao_id'],case['proposal_id'],metrics,[value],result.status,
                        experiment_id=experiment_id,question_id=case['id'],configuration=config)
                rows.append(dict(experiment_id=str(experiment_id),run_id=str(run_id),case_id=case['id'],mode=mode,repeat=repeat,
                    status=result.status,agent=result.agent,model=result.model_used,**metrics,**scoring,result=value))
    manifest['completed_at']=utc_now()
    summaries={}
    for mode in modes:
        subset=[row for row in rows if row['mode']==mode]
        latencies=sorted(row['total_ms'] for row in subset)
        summaries[mode]=dict(runs=len(subset),completed=sum(row['status']=='completed' for row in subset),
            mean_latency_ms=statistics.mean(latencies), median_latency_ms=statistics.median(latencies),
            p95_latency_ms=latencies[min(len(latencies)-1,math.ceil(.95*len(latencies))-1)])
        for metric in ('fact_match_accuracy','citation_validity','routing_accuracy','tool_success_rate','blockchain_accuracy'):
            known=[float(row[metric]) for row in subset if row.get(metric) is not None]
            summaries[mode][metric]=statistics.mean(known) if known else None
            summaries[mode][metric+'_sample_count']=len(known)
    manifest['summaries']=summaries
    path=Path(output);path.mkdir(parents=True,exist_ok=True)
    (path/'results.json').write_text(json.dumps({'manifest':manifest,'results':rows},indent=2),encoding='utf8')
    fields=['experiment_id','run_id','case_id','mode','repeat','status','agent','model','total_ms','tool_calls','tool_successes','retrieval_ms','llm_ms','input_tokens','output_tokens','embedding_tokens','retries','fact_match_accuracy','exact_match_accuracy','citation_validity','citation_gold_precision','citation_gold_recall','routing_accuracy','tool_success_rate','blockchain_accuracy','blockchain_status']
    with (path/'results.csv').open('w',newline='',encoding='utf8') as file:
        writer=csv.DictWriter(file,fieldnames=fields,extrasaction='ignore');writer.writeheader()
        writer.writerows({k:("'"+v if isinstance(v,str) and v.startswith(('=','+','-','@')) else v) for k,v in row.items()} for row in rows)
    return dict(experiment_id=str(experiment_id),runs=len(rows),output=str(path.resolve()))
