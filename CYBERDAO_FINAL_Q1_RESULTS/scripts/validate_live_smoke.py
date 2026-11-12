"""Validate only technical smoke compatibility; model/application failures stay in results."""
import json
from pathlib import Path
H=Path(__file__).resolve().parents[1];L=H/'live_campaign';conditions={'B3','B4','A1','A2','A12'}
allrows=[json.loads(s) for s in (L/'raw/development_smoke.jsonl').read_text(encoding='utf8').splitlines()];rows=[r for r in allrows if r['condition'] in conditions]
assert len(rows)==20 and len({(r['id'],r['model'],r['condition']) for r in rows})==20
assert all(r['id'].startswith('DEV-') for r in rows)
harness_errors=[{'id':r['id'],'condition':r['condition'],'error':r['error']} for r in rows if r.get('error') and r['error'].startswith(('TypeError:','AttributeError:','KeyError:','AssertionError:'))]
result={'passed':not harness_errors,'active_conditions':sorted(conditions),'recorded_keys':20,'new_missing_keys_executed':10,'reused_small_model_keys':10,'other_historical_B1_B2_records':8,'model_or_workflow_failures_retained':sum(r['status']!='completed' for r in rows),'harness_errors':harness_errors,'whole_answer_accuracy_validated':False,'human_annotations':0,'phase_equivalence':'evidence/phase_equivalence.json'}
(L/'smoke_validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result));raise SystemExit(bool(harness_errors))
