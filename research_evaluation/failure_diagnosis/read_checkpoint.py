"""Read current scoped index checkpoints; do not infer historical row versions."""
import asyncio
import json
import platform
from pathlib import Path
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]

async def main():
    configuration={}
    for line in (REPO/'.env').read_text(encoding='utf8').splitlines():
        key,_,value=line.partition('=')
        if key.strip() in ['CYBERCHAIN_CHAIN_ID','GOVERNANCE_CONTRACT_ADDRESS']:
            configuration[key.strip()]=value.strip().strip('"').strip("'")
    prior=json.loads((HERE.parent/'springer_history/assignment_history.json').read_text(encoding='utf8'))
    async with AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on','autocommit':True},open=False) as p:
        async with p.connection() as c:
            rows=await(await c.execute('SELECT indexer_name,indexer_version,processed_block_number,updated_at FROM public.indexer_checkpoints WHERE chain_id=%s AND lower(contract_address)=lower(%s)',
                (configuration['CYBERCHAIN_CHAIN_ID'],configuration['GOVERNANCE_CONTRACT_ADDRESS']))).fetchall()
    result={'source':'Current scoped public.indexer_checkpoints read-only query','rows':[
        {'indexer':r[0],'version':r[1],'processed_block':str(r[2]),'updated_at':r[3].isoformat(),'reached_archived_pin':int(r[2])>=int(prior['pinned_block'])} for r in rows],
        'limit':'Current progress cannot establish historical SQL assignment state or successful execution of a reverted transaction.'}
    with (HERE/'indexer_checkpoint.json').open('x',encoding='utf8') as f:json.dump(result,f,indent=2)
    print('Scoped indexer checkpoints inspected:',len(rows))

if __name__=='__main__':asyncio.run(main(),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
