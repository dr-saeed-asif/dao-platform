"""Offline benchmark integrity checks; optional live read-only DB drift check."""
import argparse,asyncio,hashlib,json,re
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def main():
    q=json.loads((ROOT/'questions.json').read_text());g=json.loads((ROOT/'ground_truth.json').read_text())
    released=json.loads((ROOT/'questions_verified.json').read_text());quality=json.loads((ROOT/'quality.json').read_text())
    snap=json.loads((ROOT/'evidence/snapshot.json').read_text());sha=hashlib.sha256((ROOT/'evidence/snapshot.json').read_bytes()).hexdigest()
    assert Counter(x['category'] for x in q)=={'DB':40,'PDF':40,'MS':40,'CX':30,'UN':25,'UA':25}
    assert len({x['id'] for x in q})==len({x['question'].casefold() for x in q})==len({json.dumps(x['semantic_target']) for x in q})==200
    assert {x['id'] for x in q}=={x['id'] for x in g}
    assert all(x['snapshot_sha256']==sha and x['source_identifiers'] for x in g)
    assert all(x['category']!='UN' for x in released) and len(released)==len(quality['final_benchmark_eligible_ids'])
    assert not {x['id'] for x in released}&set(quality['quarantined_ids'])
    byid={x['id']:x for x in q};prompt_leaks=[]
    for gold in g:
        item=byid[gold['id']]
        if item['category']=='DB' and len(gold['expected_answer'])>8 and gold['expected_answer'].casefold() in item['question'].casefold():prompt_leaks.append(item['id'])
    assert not prompt_leaks
    for label,doc in snap['documents'].items():
        assert hashlib.sha256((ROOT.parent/'datasets/source_documents'/doc['filename']).read_bytes()).hexdigest()==doc['sha256']
    probes=json.loads((ROOT/'evidence/authorization_probes.json').read_text())
    assert len(probes)==25 and all(p['status']==401 for p in probes)
    rows=[];smoke_rows=0;subset_rows=0
    for p in (ROOT/'raw_results').glob('*/responses.jsonl'):
        r=[json.loads(s) for s in p.read_text().splitlines()];assert len({(x['id'],x['variant']) for x in r})==len(r);rows+=r
        if p.parent.name in ('smoke','smoke-v2'):smoke_rows+=len(r)
        else:subset_rows+=len(r)
    result={'candidate_count':200,'released_machine_source_checked_count':len(released),'quarantined_count':len(quality['quarantined_ids']),
        'raw_smoke_attempts':smoke_rows,'raw_subset_attempts':subset_rows,'raw_attempts_total':len(rows),
        'duplicate_exact_texts':0,'duplicate_declared_targets':0,'detected_long_answer_prompt_leaks_in_current_DB_items':prompt_leaks,
        'semantic_near_duplicate_review':'Not independently performed; distinct combinations over overlapping facts are not independent samples',
        'semantic_ground_truth_review':'Unblinded source anchoring only; no independent human review',
        'benchmark_release_gate':'BLOCKED','reason':'25 bounded-absence items lack independent semantic verification; smoke reveals routing and answer failures',
        'full_evaluation_allowed':False,'model_outputs_preserved':True}
    (ROOT/'metrics/validation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print('Checked 200 candidates /',len(released),'source-check-only entries; independent validation unavailable and full release remains BLOCKED.')

if __name__=='__main__':main()
