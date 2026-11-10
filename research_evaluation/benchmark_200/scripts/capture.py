"""Capture fresh read-only evidence. Never export credentials, addresses or member rows."""
import asyncio, hashlib, json, platform, re, subprocess
from datetime import datetime, timezone
from pathlib import Path
import httpx
from psycopg_pool import AsyncConnectionPool
from pypdf import PdfReader
from app.model.config.settings import settings

ROOT = Path(__file__).resolve().parents[1]
IDS = [('pilot','e3b14215-bd47-420a-ae5a-a50d15cf0255'),('training','38a3c43c-1e3b-47c9-8688-20e6e64ec495'),('cleanup','16dadecc-94cc-4fae-8089-921765854976'),('testing','onchain-28')]
SQL = """SELECT p.id,p.dao_id,p.title,p.status,p.proposal_type,p.on_chain_id,p.chain_id,p.starts_at,p.ends_at,p.total_votes,
 (SELECT count(*) FROM public.votes v WHERE v.proposal_id=p.id) indexed_votes,
 (SELECT count(*) FROM public.proposal_assignments a WHERE a.proposal_id=p.id AND a.assigned) assigned,
 (SELECT count(*) FROM public.proposals d WHERE d.dao_id=p.dao_id) dao_proposals
 FROM public.proposals p WHERE p.id=ANY(%s) ORDER BY p.id"""

async def main():
    out=ROOT/'evidence'; out.mkdir(parents=True,exist_ok=True)
    if (out/'snapshot.json').exists(): raise RuntimeError('Snapshot already exists; preserve it')
    result={'captured_utc':datetime.now(timezone.utc).isoformat(),'database':{},'blockchain':{},'documents':{},'authorization':[]}
    async with AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on','autocommit':True},open=False) as pool:
        async with pool.connection() as c:
            assert (await (await c.execute('SHOW transaction_read_only')).fetchone())[0]=='on'
            async with c.transaction():
                await c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
                cursor=await c.execute(SQL,([p for _,p in IDS],))
                names=[d.name for d in cursor.description]
                records=[dict(zip(names,r)) for r in await cursor.fetchall()]
                # Independent aggregate SQL validates captured correlated counts.
                votes=dict(await (await c.execute('SELECT proposal_id,count(*) FROM public.votes GROUP BY proposal_id')).fetchall())
                assignments=dict(await (await c.execute('SELECT proposal_id,count(*) FROM public.proposal_assignments WHERE assigned IS TRUE GROUP BY proposal_id')).fetchall())
                for label,pid in IDS:
                    row=next(r for r in records if r['id']==pid)
                    assert row['indexed_votes']==votes.get(pid,0) and row['assigned']==assignments.get(pid,0)
                    result['database'][label]=row
    token=settings.dao_backend_token.get_secret_value() if settings.dao_backend_token else settings.rag_dev_token.get_secret_value()
    async with httpx.AsyncClient(timeout=95,trust_env=False) as client:
        result['infrastructure']={'ollama':(await client.get(settings.ollama_base_url+'/api/version')).raise_for_status().json(),
            'models':(await client.get(settings.ollama_base_url+'/api/tags')).raise_for_status().json(),
            'ai_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'python':platform.python_version(),'os':platform.platform()}
        for label,pid in IDS:
            row=result['database'][label]
            response=await client.get(settings.dao_backend_url+'/v1/ai/internal/proposals/'+pid+'/verification',params={'dao_id':row['dao_id']},headers={'Authorization':'Bearer '+token})
            response.raise_for_status(); chain=response.json()
            assert chain['proposal_id']==pid and chain['dao_id']==row['dao_id']
            # Exact chain fields needed for benchmark; no event actors exported.
            result['blockchain'][label]={k:chain.get(k) for k in ('proposal_id','dao_id','chain_id','block_number','block_hash','observed_at','status','voting_status','proposal','vote_counts','comparisons','errors')}
        response=await client.post(settings.dao_backend_url+'/v1/ai/assistant/ask',json={'proposalId':IDS[0][1],'question':['Show the selected proposal title.']})
        result['authorization'].append({'method':'POST','route':'/v1/ai/assistant/ask','credentials':'absent','expected':401,'observed':response.status_code})
    for label,name in [('pilot','CyberGovAI_Pilot_Proposal.pdf'),('training','CyberDAO_Community_Training_Proposal.pdf')]:
        path=ROOT.parent/'datasets/source_documents'/name
        result['documents'][label]={'filename':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'pages':[p.extract_text() for p in PdfReader(path).pages]}
    # Public hashes retained for pinned-chain provenance; addresses and per-wallet comparison rows omitted.
    for chain in result['blockchain'].values():
        chain['comparisons']=[r for r in chain['comparisons'] if ':' not in r.get('field','') and not re.search('address|wallet|metadata_uri',r.get('field',''),re.I)]
        chain['proposal']={k:v for k,v in (chain.get('proposal') or {}).items() if not re.search('address|creator|owner|uri|hash',k,re.I)}
    text=json.dumps(result,indent=2,default=str,ensure_ascii=False)
    text=re.sub(r'0x[0-9a-fA-F]{40}(?![0-9a-fA-F])','[address omitted]',text)
    (out/'snapshot.json').write_text(text,encoding='utf8')
    (out/'snapshot.sha256').write_text(hashlib.sha256((out/'snapshot.json').read_bytes()).hexdigest()+'\n',encoding='ascii')
    print('Captured 4 database/chain scopes, 2 PDFs and live auth boundary.',flush=True)

if __name__=='__main__':
    asyncio.run(main(),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
