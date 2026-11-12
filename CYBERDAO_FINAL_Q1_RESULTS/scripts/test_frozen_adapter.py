"""Offline frozen-corpus adapter contract. Mock outputs never enter research results."""
import asyncio,importlib.util,json,selectors,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import httpx
import frozen_corpus_rag as rag
from run import HERE,MODELS,OPTIONS
class Client:
 calls=[]
 def __init__(self,*a,**k):pass
 async def __aenter__(self):return self
 async def __aexit__(self,*a):pass
 async def get(self,url):return httpx.Response(200,request=httpx.Request('GET',url),json={'models':[{'name':m,'digest':'mock-only-'+m} for m in MODELS+['qwen3-embedding:0.6b']]})
 async def post(self,url,json):return await self.send(httpx.Request('POST',url,json=json))
 async def send(self,request,*a,**k):
  body=json.loads(request.content);self.calls.append((request.url.path,body))
  data={'embeddings':[[1.,0.,0.]],'prompt_eval_count':3} if request.url.path=='/api/embed' else {'message':{'role':'assistant','content':'Fixture answer [D1]'},'eval_count':4,'prompt_eval_count':30}
  return httpx.Response(200,request=request,json=data)
class TestFrozenAdapter(unittest.TestCase):
 def test_scope_freeze_no_gold_and_resumability(self):
  base=HERE/'.runtime/adapter-tests';base.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=base) as folder:
   h=Path(folder);(h/'evidence').mkdir();(h/'raw').mkdir();source=h/'evidence/source_records.json'
   source.write_text(json.dumps({'training':{'search_proposal_evidence':{'data':{'evidence':[{'source_id':'D1','content':'Synthetic fixture Venue EUR 720','chunk_key':'fixture-1'},{'source_id':'D2','content':'Synthetic fixture duration 9 days','chunk_key':'fixture-2'}]}}}}))
   def save(name,value):(h/name).write_text(json.dumps(value))
   Client.calls=[]
   with patch.object(rag,'HERE',h),patch.object(rag,'save',save),patch.object(rag.sys,'argv',['adapter','--smoke']),patch.object(httpx,'AsyncClient',Client):
    asyncio.run(rag.main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
    rows=[json.loads(s) for s in (h/'raw/frozen_rag_smoke.jsonl').read_text().splitlines()]
    self.assertEqual(len(rows),4);self.assertTrue(all(r['id'].startswith('DEV-') and len(r['sources'])==2 for r in rows))
    chats=[b for p,b in Client.calls if p=='/api/chat'];self.assertEqual(len(chats),4)
    self.assertTrue(all(b['options']==OPTIONS and 'tools' not in b for b in chats));self.assertNotIn('expected_answer',json.dumps(chats));self.assertEqual({b['model'] for b in chats},set(MODELS))
    before=len(Client.calls);asyncio.run(rag.main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()));self.assertEqual(len(Client.calls),before)
    self.assertEqual(len((h/'raw/frozen_rag_smoke.jsonl').read_text().splitlines()),4)
    source.write_text(source.read_text()+'\n')
    with self.assertRaises(AssertionError):asyncio.run(rag.main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
if __name__=='__main__':unittest.main(verbosity=2)
