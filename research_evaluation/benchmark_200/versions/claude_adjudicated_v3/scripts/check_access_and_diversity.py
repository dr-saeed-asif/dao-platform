"""Fresh read-only evidence and denied HTTP requests; no model execution."""
import asyncio,hashlib,json,platform,re
from datetime import datetime,timezone
from pathlib import Path
import httpx
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings
from app.business.governance.documents import verified_proposal_documents
V=Path(__file__).resolve().parents[1];ROOT=V.parents[1]

def sanitize(x):
    if isinstance(x,str):
        for secret in [settings.rag_dev_token,settings.dao_backend_token]:
            if secret and len(secret.get_secret_value())>8:x=x.replace(secret.get_secret_value(),'[secret redacted]')
        return re.sub(r'0x[0-9a-fA-F]{40}\b|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}|https?://\S+','[redacted]',x)
    if isinstance(x,list):return [sanitize(v) for v in x]
    if isinstance(x,dict):return {k:sanitize(v) for k,v in x.items()}
    return x

async def main():
    snapshot=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
    pid=snapshot['database']['pilot']['id'];prompt='Show the selected proposal title.'
    probes=[('malformed_plural_questions',{'proposalId':pid,'questions':[prompt]},None,400),
            ('valid_singular_question_no_wallet',{'proposalId':pid,'question':[prompt]},None,401),
            ('valid_singular_question_invalid_wallet_token',{'proposalId':pid,'question':[prompt]},'invalid.public.test.token',401)]
    auth=[]
    async with httpx.AsyncClient(timeout=15,trust_env=False) as client:
        for name,body,token,expected in probes:
            try:
                r=await client.post(settings.dao_backend_url+'/v1/ai/assistant/ask',json=body,
                    headers={'Authorization':'Bearer '+token} if token else {})
                try:payload=r.json()
                except ValueError:payload=r.text
                auth.append({'case':name,'checked_utc':datetime.now(timezone.utc).isoformat(),'request_body':body,
                    'credentials':'invalid public test value' if token else 'absent','expected':expected,'status':r.status_code,
                    'response_body':sanitize(payload),'content_type':r.headers.get('content-type'),
                    'response_bytes':len(r.content),'status_matches':r.status_code==expected})
            except Exception as e:auth.append({'case':name,'error':type(e).__name__,'expected':expected})
    (V/'evidence/authorization_reconciliation.json').write_text(json.dumps(auth,indent=2),encoding='utf8')
    inventory={'checked_utc':datetime.now(timezone.utc).isoformat(),'proposals':[],'scope':'All currently visible database proposals; only whitelisted public demo fields exported','errors':[]}
    async with AsyncConnectionPool(settings.postgres_url,kwargs={'options':'-c default_transaction_read_only=on','autocommit':True},open=False) as pool:
        async with pool.connection() as c:
            proposals=await (await c.execute('SELECT id,dao_id,title FROM public.proposals ORDER BY id')).fetchall()
            known={x['id'] for x in snapshot['database'].values()}
            for pid,dao,title in proposals:
                try:
                    docs=await verified_proposal_documents(pool,pid,dao)
                    inventory['proposals'].append({'id':pid,'dao_id':dao,'title':title,'previously_in_source_pool':pid in known,'documents':docs})
                except Exception as e:inventory['errors'].append({'proposal_id':pid,'error':type(e).__name__})
    local=[]
    for folder in [ROOT.parent/'datasets/source_documents',Path('C:/Users/asifs/Documents/ChatGPT/CyberDao/output/pdf')]:
        if folder.exists():
            local += [{'filename':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'origin':'saved research PDFs' if folder.name=='source_documents' else 'workspace original PDFs'} for p in folder.glob('*.pdf')]
    inventory['locally_available_original_pdfs']=local
    inventory['new_proposal_count']=sum(not p['previously_in_source_pool'] for p in inventory['proposals'])
    inventory['human_review_status']='Inventory only; no new question or private-source publication approval inferred'
    (V/'evidence/diversity_inventory.json').write_text(json.dumps(sanitize(inventory),indent=2,ensure_ascii=False),encoding='utf8')
    print('Authorization:',[(p['case'],p.get('status',p.get('error'))) for p in auth])
    print('Proposal inventory:',len(inventory['proposals']),'new:',inventory['new_proposal_count'])

if __name__=='__main__':asyncio.run(main(),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
