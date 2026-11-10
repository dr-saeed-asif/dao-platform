"""Analyze only the new nonconfirmatory count subset; preserve prior smoke metrics."""
import csv,hashlib,json,random,re,statistics as st
from collections import defaultdict
from pathlib import Path
from app.business.agents.claims import verify_claims
ROOT=Path(__file__).resolve().parents[1]
REF=re.compile(r'\[((?:D|G|B)\d+)\]')

def ci(values):
    rng=random.Random(42);n=len(values)
    vals=sorted(st.mean(values[rng.randrange(n)] for _ in range(n)) for _ in range(5000))
    return {'estimate':st.mean(values),'low':vals[125],'high':vals[4874],'clusters':n,'resamples':5000,'seed':42,
        'method':'Exploratory percentile resampling of four observed proposals, two questions per proposal',
        'interpretation':'Conditional on this purposive source pool; not a population CI or stochastic-generation CI; degenerate intervals are possible'}

def main():
    questions={q['id']:q for q in json.loads((ROOT/'questions.json').read_text(encoding='utf8'))}
    source=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
    path=ROOT/'raw_results/source-counts-v1/responses.jsonl'
    raw=[json.loads(s) for s in path.read_text(encoding='utf8').splitlines()]
    assert len({(r['id'],r['variant']) for r in raw})==len(raw)
    scores=[]
    for line,r in enumerate(raw,1):
        q=questions[r['id']];field=q['semantic_target'][-1];label=q['scope_label'];expected=source['database'][label][field]
        answer=REF.sub('',r.get('answer') or '').lower().replace('*','').replace(',','')
        for word,n in [('zero',0),('two',2),('nine',9),('ten',10)]:answer=re.sub(r'\b'+word+r'\b',str(n),answer)
        if field=='indexed_votes':
            noun=r'(?:indexed\s+)?vote\s+records?|indexed\s+votes?|votes?|(?:stored\s+)?database\s+count'
            answer=re.sub(r'\bno\s+(indexed\s+vote\s+records?|votes?)\b',r'0 \1',answer)
        else:
            noun=r'(?:active\s+)?assignments?|(?:assigned\s+)?members?'
            answer=re.sub(r'\bno\s+(assigned\s+members?|active\s+assignments?)\b',r'0 \1',answer)
        hit=bool(re.search(rf'(?<!\d){expected}\s+(?:{noun})\b|\b(?:{noun})\b[^.\d\n]{{0,65}}(?<!\d){expected}(?!\d)',answer))
        abstention=bool(re.search(r'does not establish|unknown facts|no information|does not (?:record|provide)|not specified|none of the provided functions|no function is available',answer))
        refs=set(REF.findall(r.get('answer') or ''));available={s['source_id'] for s in r.get('sources',[])}
        chats=[c for c in r['provider_calls'] if c['path']=='/api/chat']
        inputs=[c['response'].get('prompt_eval_count') for c in chats];outputs=[c['response'].get('eval_count') for c in chats]
        row={'id':r['id'],'variant':r['variant'],'scope':label,'field':field,'gold_count':expected,'status':r['status'],
             'requested_count_proxy_hit':hit,'abstention_wording':abstention,'mixed_certainty_flag':hit and abstention,
             'valid_reference_ids':len(refs&available),'reference_ids':len(refs),'available_sources':len(available),
             'wall_ms':r['wall_ms'],'input_tokens':sum(inputs) if inputs and all(x is not None for x in inputs) else None,
             'output_tokens':sum(outputs) if outputs and all(x is not None for x in outputs) else None,
             'provider_chat_calls':len(chats),'output_origin':r['output_origin'],'retrieval_ms':r.get('workflow_metrics',{}).get('retrieval_ms'),
             'tool_failures':sum(t['status']=='failed' for t in r.get('tool_events',[])),
             'automatic_claim_check':verify_claims(r.get('answer') or '',r.get('sources',[])),
             'raw_file':'raw_results/source-counts-v1/responses.jsonl','raw_line':line,'independent_semantic_review':False}
        scores.append(row)
    summary={}
    for variant in ['B1','B2','B3','B4']:
        group=[r for r in scores if r['variant']==variant]
        cluster=defaultdict(list)
        for r in group:cluster[r['scope']].append(int(r['requested_count_proxy_hit']))
        def median(field):
            v=[r[field] for r in group if r[field] is not None];return st.median(v) if v else None
        summary[variant]={'attempts':len(group),'completed':sum(r['status']=='completed' for r in group),
            'requested_count_proxy_hits':sum(r['requested_count_proxy_hit'] for r in group),
            'mixed_certainty_flags':sum(r['mixed_certainty_flag'] for r in group),
            'abstention_wording_cases':sum(r['abstention_wording'] for r in group),
            'reference_ids':sum(r['reference_ids'] for r in group),'valid_reference_ids':sum(r['valid_reference_ids'] for r in group),
            'median_wall_ms':median('wall_ms'),'median_input_tokens':median('input_tokens'),'median_output_tokens':median('output_tokens'),
            'median_reported_retrieval_ms':median('retrieval_ms'),
            'fallback_or_mixed_origin':sum(r['output_origin']=='fallback_or_mixed' for r in group),
            'failures':sum(r['status']=='failed' for r in group),
            'conditional_cluster_bootstrap95':ci([st.mean(v) for v in cluster.values()]),
            'population_accuracy_ci':None,'independent_answer_accuracy':None,'independent_claim_support':None}
    full={r['id']:r for r in scores if r['variant']=='B4'};paired={}
    for v in ['B1','B2','B3']:
        baseline={r['id']:r for r in scores if r['variant']==v};keys=sorted(full.keys() & baseline.keys());diffs=defaultdict(list);lat=defaultdict(list)
        for k in keys:
            diffs[full[k]['scope']].append(int(full[k]['requested_count_proxy_hit'])-int(baseline[k]['requested_count_proxy_hit']))
            lat[full[k]['scope']].append((full[k]['wall_ms']-baseline[k]['wall_ms'])/1000)
        paired[v]={'pairs':len(keys),'B4_only_hit':sum(full[k]['requested_count_proxy_hit'] and not baseline[k]['requested_count_proxy_hit'] for k in keys),
            'baseline_only_hit':sum(baseline[k]['requested_count_proxy_hit'] and not full[k]['requested_count_proxy_hit'] for k in keys),
            'conditional_proxy_difference_bootstrap95':ci([st.mean(x) for x in diffs.values()]),
            'conditional_latency_difference_seconds_bootstrap95':ci([st.mean(x) for x in lat.values()]),
            'p_value':None,'reason':'Eight purposive dependent questions, four proposals and no independent semantic validation; no confirmatory test'}
    for name,obj in [('metrics/subset_scores.json',scores),('metrics/subset_summary.json',summary),('metrics/subset_paired.json',paired)]:
        (ROOT/name).write_text(json.dumps(obj,indent=2),encoding='utf8')
    with (ROOT/'tables/source_counts_subset.csv').open('w',newline='',encoding='utf8') as f:
        fields=['variant','attempts','completed','requested_count_proxy_hits','mixed_certainty_flags','abstention_wording_cases',
                'reference_ids','valid_reference_ids','median_wall_ms','median_input_tokens','median_output_tokens','failures']
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
        for v,s in summary.items():w.writerow({'variant':v,**s})
    print({v:(s['requested_count_proxy_hits'],s['attempts'],s['mixed_certainty_flags']) for v,s in summary.items()})

if __name__=='__main__':main()
