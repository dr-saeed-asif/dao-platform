"""Check eligibility/current count sources without repeating any model trial."""
import argparse,asyncio,json,platform
from datetime import datetime,timezone
from pathlib import Path
import httpx
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings
ROOT=Path(__file__).resolve().parents[1]

async def main(output):
    s=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
    result={'checked_utc':datetime.now(timezone.utc).isoformat(),'read_only':None,'scope_checks':[],'errors':[]}
    try:
        async with AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on','autocommit':True},open=False) as pool:
            async with pool.connection() as c:
                result['read_only']=(await (await c.execute('SHOW transaction_read_only')).fetchone())[0]=='on'
                for label,row in s['database'].items():
                    votes=(await (await c.execute('SELECT count(*) FROM public.votes WHERE proposal_id=%s',(row['id'],))).fetchone())[0]
                    members=(await (await c.execute('SELECT count(*) FROM public.proposal_assignments WHERE proposal_id=%s AND assigned IS TRUE',(row['id'],))).fetchone())[0]
                    result['scope_checks'].append({'scope':label,'indexed_votes':votes,'assigned':members,
                        'matches_snapshot':votes==row['indexed_votes'] and members==row['assigned']})
        async with httpx.AsyncClient(timeout=10,trust_env=False) as client:
            r=await client.get(settings.ollama_base_url+'/api/tags');r.raise_for_status()
            result['models']=r.json()['models']
            result['backend_health']=(await client.get(settings.dao_backend_url+'/v1/health')).status_code
        result['passed']=result['read_only'] and all(c['matches_snapshot'] for c in result['scope_checks']) and result['backend_health']==200 and settings.ollama_chat_model in {m['name'] for m in result['models']}
    except Exception as exc:
        result['errors'].append(type(exc).__name__);result['passed']=False
    (ROOT/'review'/output).write_text(json.dumps(result,indent=2),encoding='utf8')
    print('Subset preflight passed:',result['passed'])
    if not result['passed']:raise RuntimeError('Infrastructure or snapshot drift blocks new subset')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',choices=['subset_preflight.json','subset_postflight.json'],default='subset_preflight.json')
    asyncio.run(main(p.parse_args().output),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
