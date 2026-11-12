import json
from pathlib import Path
from run import HERE,MODELS,OPTIONS,save
rows=[json.loads(s) for s in (HERE/'raw/frozen_rag_smoke.jsonl').read_text(encoding='utf8').splitlines()]
assert len(rows)==4 and len({(r['id'],r['model']) for r in rows})==4
assert {r['model'] for r in rows}==set(MODELS)
assert all(r['id'].startswith('DEV-') for r in rows)
assert all(r['sources'] for r in rows)
assert all(r['provider_calls'] and all(c['request']['model']==r['model'] and c['request']['options']==OPTIONS and 'tools' not in c['request'] for c in r['provider_calls']) for r in rows)
assert not any(r.get('error') and r['error'].startswith(('TypeError','KeyError','AttributeError','AssertionError')) for r in rows)
save('frozen_rag_harness_validation.json',{'passed':True,'observations':4,'model_generations_attempted':4,'model_failures_retained':sum(r['status']!='completed' for r in rows),'gold_loaded_by_runner':False,'human_reviewed':False,'note':'Technical adapter validation; no answer-quality release criterion'})
print('Frozen RAG technical smoke passed; output failures retained')
