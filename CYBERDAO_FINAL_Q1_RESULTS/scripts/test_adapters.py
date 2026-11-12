import asyncio,hashlib,json,unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
import adapters
from app.business.agents import workflow as wf,synthesis as syn
from app.business.agents.claims import verify_claims,blocking_flags
class TestAdapters(unittest.TestCase):
 def test_extractor_disabled_and_restored(self):
  original={n:getattr(wf.MultiAgentWorkflow,n) for n in adapters.EXTRACTORS};budget=wf.budget_answer
  with adapters.condition('A1'):
   for n in original:self.assertIsNone(getattr(wf.MultiAgentWorkflow,n)('question',[]))
   self.assertIsNone(wf.budget_answer('question',[]))
   self.assertIs(wf.blocking_flags,blocking_flags);self.assertIs(syn.blocking_flags,blocking_flags)
  for n,value in original.items():self.assertIs(getattr(wf.MultiAgentWorkflow,n),value)
  self.assertIs(wf.budget_answer,budget)
 def test_gate_disabled_both_local_imports(self):
  with adapters.condition('A2'):
   self.assertEqual(wf.blocking_flags({'bad':True}),[]);self.assertEqual(syn.blocking_flags({'bad':True}),[])
  self.assertIs(wf.blocking_flags,blocking_flags);self.assertIs(syn.blocking_flags,blocking_flags)
 def test_combined_ablation(self):
  with adapters.condition('A12'):
   self.assertIsNone(wf.budget_answer('x',[]));self.assertEqual(syn.blocking_flags({}),[])
 def test_structural_gate_not_disabled(self):
  gate=wf.verify_citations
  for name in ['B4','A1','A2','A12']:
   with adapters.condition(name):self.assertIs(wf.verify_citations,gate);self.assertFalse(gate('cost [D404]',[])['valid'])
 def test_scope_is_enforced(self):
  with self.assertRaises(PermissionError):adapters.single.check_scope({'dao':'one','proposal':'p'},{'dao_id':'two'})
  with self.assertRaises(PermissionError):adapters.single.check_scope({'dao':'one','proposal':'p'},{'proposal_id':'q'})
 def test_errors_not_evidence(self):
  reply,status=adapters.single.tool_reply('x',{'success':False,'error':{'code':'timeout'}},syn.CitationRegistry())
  self.assertEqual(status,'failed');self.assertNotIn('evidence',reply)
 def test_inference_code_does_not_load_gold(self):
  runner=Path(__file__).with_name('run.py').read_text(encoding='utf8');source=Path(adapters.__file__).read_text(encoding='utf8')
  self.assertNotIn('ground_truth.json',runner+source);self.assertNotIn('expected_answer',runner+source);self.assertNotIn('confirmatory_gold',runner+source)
 def test_factual_support_not_reference_validity(self):
  sources=[{'source_id':'D1','content':'Venue rental: EUR 720\nTravel: EUR 180'}]
  self.assertTrue(wf.verify_citations('Travel: EUR 720 [D1]',sources)['valid'])
  self.assertTrue(blocking_flags(verify_claims('Travel: EUR 720 [D1]',sources)))
 def test_restores_on_exception(self):
  old=wf.budget_answer
  with self.assertRaises(RuntimeError):
   with adapters.condition('A12'):raise RuntimeError('fixture')
  self.assertIs(wf.budget_answer,old)
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestAdapters);result=unittest.TextTestRunner(verbosity=2).run(suite)
 Path(__file__).resolve().parents[1].joinpath('static_checks.json').write_text(json.dumps({'passed':result.wasSuccessful(),'tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'classification':'Offline adapter fixtures; no model generations or human judgments'},indent=2))
 raise SystemExit(not result.wasSuccessful())
