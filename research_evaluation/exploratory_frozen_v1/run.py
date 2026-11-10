"""Exploratory real-model run with shared exported read-only SQL snapshot.

Reuse existing B1-B4 implementations. This runner never reads the gold file.
Every SQL tool transaction imports one MVCC snapshot. Checkpoint resume requires
unchanged full-public-table fingerprints and model/build configuration.
"""
import asyncio
import contextlib
import hashlib
import importlib.util
import json
import logging
import os
import platform
import random
import subprocess
import time
from pathlib import Path
from unittest.mock import patch

import httpx
from psycopg import sql
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings
from app.business.rag.service import RagService
from app.business.mcp.context import ExecutionContext
from app.business.agents.blockchain import BlockchainVerificationAgent

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
REPO=ROOT.parent
VERSION=ROOT/'benchmark_200/versions/claude_adjudicated_v3'
IDS=['DB-006','DB-016','PDF-006','PDF-026','MS-002','MS-026','UN-R001','UN-R018']
spec=importlib.util.spec_from_file_location('saved_baselines',ROOT/'benchmark_200/scripts/run.py')
baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

class FrozenPool:
    def __init__(self,pool,snapshot):self.pool,self.snapshot=pool,snapshot
    @contextlib.asynccontextmanager
    async def connection(self):
        async with self.pool.connection() as conn:
            async with conn.transaction():
                await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                await conn.execute(sql.SQL('SET TRANSACTION SNAPSHOT {}').format(sql.Literal(self.snapshot)))
                yield conn

class LocalRecorder:
    def __init__(self):self.records=[]
    async def record(self,metrics):self.records.append(metrics.model_dump(mode='json'))

async def fingerprints(conn):
    names=await(await conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).fetchall()
    result={}
    for (name,) in names:
        query=sql.SQL("SELECT count(*), md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {} AS t").format(sql.Identifier('public',name))
        count,value=await(await conn.execute(query)).fetchone()
        result[name]={'rows':count,'aggregate_digest':value}
    return result

async def main():
    cases={x['id']:x for x in json.loads((VERSION/'confirmatory_questions.json').read_text(encoding='utf8'))}
    assert all(i in cases and not cases[i]['exposed_to_systems'] for i in IDS)
    for path in (ROOT/'benchmark_200/raw_results').glob('*/responses.jsonl'):
        assert not {json.loads(s)['id'] for s in path.read_text(encoding='utf8').splitlines()}&set(IDS)
    async with httpx.AsyncClient(timeout=10,trust_env=False) as client:
        models=(await client.get(settings.ollama_base_url+'/api/tags')).raise_for_status().json()
    names={m['name']:m['digest'] for m in models['models']}
    assert settings.ollama_chat_model in names and settings.ollama_fast_model in names
    pool=AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on','autocommit':True},min_size=1,max_size=8,open=False)
    await pool.open(wait=True,timeout=10)
    try:
        async with pool.connection() as exporter:
            async with exporter.transaction():
                await exporter.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                snapshot=(await(await exporter.execute('SELECT pg_export_snapshot()')).fetchone())[0]
                source=await fingerprints(exporter)
                config={'classification':'Exploratory; independent Claude LLM source audit; human adjudication pending',
                    'ids':IDS,'variants':baseline.VARIANTS,'model':settings.ollama_chat_model,'fast_model':settings.ollama_fast_model,
                    'embedding_model':settings.ollama_embed_model,'model_digests':names,'table_fingerprints':source,
                    'question_file_sha256':digest(VERSION/'confirmatory_questions.json'),
                    'baseline_sha256':digest(ROOT/'benchmark_200/scripts/run.py'),'runner_sha256':digest(Path(__file__)),
                    'verifier_source_sha256':digest(REPO/'apps/api/src/ai/blockchain-verification.service.ts'),
                    'verifier_compiled_sha256':digest(REPO/'apps/api/dist/ai/blockchain-verification.service.js'),
                    'recorder':'Local instrumentation only, preserving read-only snapshot integrity',
                    'SQL_mode':'One exported MVCC snapshot imported by all SQL tool transactions',
                    'chain_mode':'Corrected verifier captures once using the same SQL snapshot; identical sanitized response replay for B2/B3/B4',
                    'model_settings':'Existing baselines unchanged; provider options recorded for each call',
                    'timeout_seconds':200,'concurrency':1,'order_seed':59,
                    'human_reviewed':False,'gold_loaded_by_runner':False,
                    'prospective_metrics':['Whole-answer rubric correct/partial/incorrect/failed, assistant-reviewed with human status pending',
                        'Claim support assessed against recorded returned evidence; distinguish sampled review from exhaustive annotations',
                        'Structural citation validity and coverage','Appropriate and false abstention','Latency, all provider tokens and failures'],
                    'whole_answer_rubric':'Correct requires all requested, correctly attributed supported facts and no material unsupported assertion. Partial if material omissions or conflicting uncertainty. Incorrect if false facts or wrong-source substitution. Failures count separately.',
                    'independent_population_inference':False}
                config_path=HERE/'config.json'
                if config_path.exists():
                    assert json.loads(config_path.read_text(encoding='utf8'))==config,'Resume source/configuration changed'
                else:config_path.write_text(json.dumps(config,indent=2),encoding='utf8')
                chain_path=HERE/'chain_snapshot.json'
                if not chain_path.exists():
                    process=await asyncio.to_thread(subprocess.run,['node',str(HERE/'capture_chain.cjs'),snapshot,str(chain_path)],cwd=REPO)
                    if process.returncode!=0:raise RuntimeError('Corrected chain capture failed')
                chain=json.loads(chain_path.read_text(encoding='utf8'))
                async def replay(self,dao_id,proposal_id):
                    if not self.context.operator_verified:raise PermissionError('Operator required')
                    for record in chain:
                        if record['proposal_id']==proposal_id and record['dao_id']==dao_id:return record
                    raise PermissionError('Frozen chain scope unavailable')
                rag=RagService(FrozenPool(pool,snapshot));rag.recorder=LocalRecorder()
                context=ExecutionContext(rag.pool,rag,True)
                observed=[];original_send=httpx.AsyncClient.send
                async def measured_send(self,request,*args,**kwargs):
                    start=time.perf_counter();response=await original_send(self,request,*args,**kwargs)
                    if request.url.path in ['/api/chat','/api/embed','/api/embeddings']:
                        payload=json.loads(request.content)
                        observed.append({'path':request.url.path,'model':payload.get('model'),'options':payload.get('options'),
                            'prompt_sha256':hashlib.sha256(request.content).hexdigest(),'http':response.status_code,
                            'ms':(time.perf_counter()-start)*1000,'response':response.json()})
                    return response
                raw=HERE/'responses.jsonl'
                completed={}
                if raw.exists():completed={(r['id'],r['variant']):r for r in map(json.loads,raw.read_text(encoding='utf8').splitlines())}
                (HERE/'snapshot_session.json').write_text(json.dumps({'exported_snapshot_id':snapshot,'read_only':True,'resumed_records':len(completed)},indent=2),encoding='utf8')
                order=random.Random(59)
                with patch.object(BlockchainVerificationAgent,'snapshot',replay),patch.object(httpx.AsyncClient,'send',measured_send),raw.open('a',encoding='utf8') as file:
                    for ident in IDS:
                        variants=list(baseline.VARIANTS);order.shuffle(variants)
                        for variant in variants:
                            if (ident,variant) in completed:continue
                            observed.clear();rag.recorder.records.clear();start=time.perf_counter()
                            error=None
                            try:
                                async with asyncio.timeout(200):result=await baseline.run_case(cases[ident],variant,context)
                            except Exception as exc:
                                error=type(exc).__name__+': '+str(exc)[:120]
                                result={'answer':None,'status':'failed','sources':[],'output_origin':'no_final_answer'}
                            row={'id':ident,'variant':variant,'question':cases[ident]['question'],'wall_ms':(time.perf_counter()-start)*1000,
                                'error':error,**result,'provider_calls':list(observed),'local_tool_metrics':list(rag.recorder.records)}
                            file.write(json.dumps(baseline.clean(row),default=str,ensure_ascii=False)+'\n');file.flush();os.fsync(file.fileno())
                            print(ident,variant,result['status'],round(row['wall_ms']),flush=True)
    finally:await pool.close()

if __name__=='__main__':
    logging.basicConfig(level=logging.ERROR)
    asyncio.run(main(),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
