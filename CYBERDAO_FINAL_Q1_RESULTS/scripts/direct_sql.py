"""Model-free, parameterized scalar SQL baseline; no gold/reference answers loaded."""
import asyncio,datetime,decimal,json,selectors,time
from pathlib import Path
import psycopg
from psycopg import sql
from app.model.config.settings import settings
H=Path(__file__).resolve().parents[1];Q=H.parent/'research_evaluation/exploratory_frozen_v2/remaining_unexposed_questions.json'
def select_field(question):
 q=question.casefold()
 for pattern,field in [('how many proposals','dao_proposal_count'),('voting window in seconds','voting_window_seconds'),('on-chain proposal identifier','on_chain_id'),('chain id','chain_id'),('proposal type','proposal_type'),('start timestamp','starts_at'),('end timestamp','ends_at'),('database title','title'),('raw proposal status','status'),('cached total_votes','total_votes')]:
  if pattern in q:return field
 raise ValueError('No whitelisted scalar SQL selector')
async def main():
 cases=[c for c in json.loads(Q.read_text(encoding='utf8')) if c['category']=='DB'];assert len(cases)==26
 path=H/'live_campaign/raw/direct_sql.jsonl';path.parent.mkdir(parents=True,exist_ok=True)
 done={json.loads(s)['id'] for s in path.read_text(encoding='utf8').splitlines()} if path.exists() else set()
 async with await psycopg.AsyncConnection.connect(settings.postgres_url,options='-c default_transaction_read_only=on',autocommit=True) as conn:
  async with conn.transaction():
   await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
   with path.open('a',encoding='utf8') as out:
    for c in cases:
     if c['id'] in done:continue
     t=time.perf_counter();field=select_field(c['question']);parameters=(c['dao'],) if field=='dao_proposal_count' else (c['proposal'],c['dao'])
     if field=='dao_proposal_count':query=sql.SQL('SELECT COUNT(*) FROM public.proposals WHERE dao_id=%s')
     elif field=='voting_window_seconds':query=sql.SQL('SELECT EXTRACT(EPOCH FROM (ends_at-starts_at)) FROM public.proposals WHERE id=%s AND dao_id=%s')
     else:query=sql.SQL('SELECT {} FROM public.proposals WHERE id=%s AND dao_id=%s').format(sql.Identifier(field))
     try:
      result=await(await conn.execute(query,parameters)).fetchone();value=result[0] if result else None
      if isinstance(value,datetime.datetime):value=value.isoformat(sep=' ')
      if isinstance(value,decimal.Decimal):value=str(value.normalize()) if value!=value.to_integral_value() else str(int(value))
      row={'id':c['id'],'question':c['question'],'category':'DB','scope_label':c['scope_label'],'condition':'A_SQL','model':None,'status':'completed' if value is not None else 'unverified','field':field,'value':value,'answer':str(value) if value is not None else None,'wall_ms':(time.perf_counter()-t)*1000,'output_origin':'direct_SQL','query':query.as_string(conn),'scope':{'dao_id':c['dao'],'proposal_id':c['proposal']},'input_tokens':0,'output_tokens':0,'model_calls':0,'human_validated':False}
     except Exception as exc:row={'id':c['id'],'condition':'A_SQL','status':'failed','error_type':type(exc).__name__,'wall_ms':(time.perf_counter()-t)*1000}
     out.write(json.dumps(row,default=str,ensure_ascii=False)+'\n');out.flush()
 print(json.dumps({'direct_SQL_cases':len(cases),'applicable_population':'DB26 only; hand-coded field selector, not general natural-language-to-SQL','model_calls':0}))
if __name__=='__main__':asyncio.run(main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
