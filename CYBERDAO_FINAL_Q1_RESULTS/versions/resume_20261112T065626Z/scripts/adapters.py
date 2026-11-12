"""Research-only matched adapters. No reference answers are loaded here."""
import contextlib, contextvars, importlib.util, json, sys, time
from pathlib import Path
from unittest.mock import patch
import httpx
from app.business.agents import workflow as wf, synthesis as syn
from app.business.agents.question_planner import plan_question_batch
from app.business.agents.tools import build_tools
from app.business.agents.synthesis import CitationRegistry
ROOT=Path(__file__).resolve().parents[2]/'research_evaluation'
spec=importlib.util.spec_from_file_location('candidate_v3',ROOT/'harness_validation_v1/single_agent_candidate_v3.py')
single=importlib.util.module_from_spec(spec);spec.loader.exec_module(single)
OBS=contextvars.ContextVar('research_observations',default=None)
EXTRACTORS=['_chain_vote_answer','_stored_member_answer','_stored_voting_answer','_research_count_answer','_proposal_fact_answer']
@contextlib.contextmanager
def condition(name):
 with contextlib.ExitStack() as stack:
  if name in ('A1','A12'):
   for key in EXTRACTORS:stack.enter_context(patch.object(wf.MultiAgentWorkflow,key,lambda *a,**k:None))
   stack.enter_context(patch.object(wf,'budget_answer',lambda *a,**k:None))
  else:
   for key in EXTRACTORS:
    old=getattr(wf.MultiAgentWorkflow,key)
    def wrapped(*args,_old=old,_key=key,**kwargs):
     value=_old(*args,**kwargs)
     if value and OBS.get() is not None:OBS.get()['extractions'].append(_key)
     return value
    stack.enter_context(patch.object(wf.MultiAgentWorkflow,key,staticmethod(wrapped)))
   old=wf.budget_answer
   def budget(*a,**k):
    value=old(*a,**k)
    if value and OBS.get() is not None:OBS.get()['extractions'].append('budget_answer')
    return value
   stack.enter_context(patch.object(wf,'budget_answer',budget))
  if name in ('A2','A12'):
   for module in (wf,syn):stack.enter_context(patch.object(module,'blocking_flags',lambda *a,**k:[]))
  yield
async def plain_rag(case,context):
 args={'dao_id':case['dao'],'proposal_id':case['proposal'],'question':case['question'],'top_k':4}
 value=await build_tools(context)['search_proposal_evidence'].ainvoke(args)
 registry=CitationRegistry();reply,status=single.tool_reply('search_proposal_evidence',value,registry)
 messages=[{'role':'system','content':single.PROMPT+'Answer from the retrieved document excerpts only. You have no database or chain tool access. If the excerpts do not establish the answer, abstain.'},
 {'role':'user','content':json.dumps({'question':case['question'],'scope':{'dao_id':case['dao'],'proposal_id':case['proposal']},'retrieved_evidence':reply},default=str)}]
 from app.model.config.settings import settings
 async with httpx.AsyncClient(timeout=180,trust_env=False) as client:
  response=await client.post(settings.ollama_base_url+'/api/chat',json={'model':settings.ollama_chat_model,'stream':False,'think':False,'messages':messages})
  response.raise_for_status();answer=response.json()['message'].get('content','').strip()
 return {'answer':answer or None,'status':'completed' if answer else 'failed','sources':[x.model_dump(mode='json') for x in registry.sources.values()],
 'tool_events':[{'name':'search_proposal_evidence','status':status,'reply':reply}],'output_origin':'real_model'}
async def full(case,context):
 plan=await plan_question_batch(context.rag.ollama,case['question'])
 if plan.needs_clarification:return {'answer':plan.clarification,'status':'clarification','sources':[],'output_origin':'planner_clarification'}
 out=await wf.MultiAgentWorkflow(context,concurrency=1).run([p.question for p in plan.questions],question_plan=plan.questions,
 dao_id=case['dao'],proposal_id=case['proposal'],top_k=4,original_request=case['question'])
 data=out.final_response.model_dump(mode='json') if out.final_response else {}
 return {'answer':data.get('answer'),'status':data.get('status','failed'),'workflow_status':out.status,'sources':data.get('cited_sources',[]),
 'warnings':data.get('errors',[]),'spans':out.trace,'workflow_metrics':out.metrics,
 'output_origin':'fallback_or_mixed' if data.get('errors') or not data.get('model_used') else 'real_model',
 'worker_results':[r.model_dump(mode='json') for r in out.results]}
async def run(case,name,context):
 if name in ('B1','B3'):return await single.run(case,context,name=='B3')
 if name=='B2':return await plain_rag(case,context)
 return await full(case,context)

