"""Post-smoke read-only check for drift of captured governance fields."""
import argparse,asyncio,json,platform
from datetime import datetime,timezone
from pathlib import Path
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings
from capture import SQL,IDS,ROOT

async def main(output=None):
    saved=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
    async with AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on','autocommit':True},open=False) as p:
        async with p.connection() as c:
            cursor=await c.execute(SQL,([pid for _,pid in IDS],))
            names=[d.name for d in cursor.description]
            actual={r[0]:dict(zip(names,r)) for r in await cursor.fetchall()}
    rows=[];observations={}
    for label,row in saved['database'].items():
        current=json.loads(json.dumps(actual[row['id']],default=str))
        observations[label]=current
        mismatches=[k for k in row if current[k]!=row[k]]
        rows.append({'scope':label,'matching_fields':len(row)-len(mismatches),'mismatches':mismatches,
                     'changed_values':{k:{'captured':row[k],'post_smoke':current[k]} for k in mismatches}})
    target=Path(output) if output else ROOT/'evidence/post_smoke_database_check.json'
    target.write_text(json.dumps({'checked_utc':datetime.now(timezone.utc).isoformat(),
        'method':'Current read-only SQL projection; not a reconstruction of historical SQL state at a chain block',
        'scopes':rows,'current_observations':observations},indent=2),encoding='utf8')
    print('Post-smoke database drift fields:',sum(len(r['mismatches']) for r in rows))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output')
    asyncio.run(main(p.parse_args().output),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
