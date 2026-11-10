"""Analyze saved smoke outputs; no model, database, or blockchain calls."""
import csv,hashlib,json,re,statistics as st
from collections import Counter
from pathlib import Path
from app.business.agents.claims import verify_claims

ROOT=Path(__file__).resolve().parents[1]
REF=re.compile(r'\[((?:D|G|B)\d+)\]')

def write(name,obj):
    path=ROOT/name;path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding='utf8')

def main():
    questions={r['id']:r for r in json.loads((ROOT/'questions.json').read_text())}
    all_rows=[]; scored=[]
    for path in sorted((ROOT/'raw_results').glob('*/responses.jsonl')):
        if path.parent.name not in ('smoke','smoke-v2'):continue
        for n,line in enumerate(path.read_text(encoding='utf8').splitlines(),1):
            row=json.loads(line);row['raw_file']=str(path.relative_to(ROOT)).replace('\\','/');row['line']=n
            row['eligible']=row['id']!='DB-001' and row['question']==questions[row['id']]['question']
            row['exclusion_reason']=None if row['eligible'] else 'Answer leaked in old scope label; archived pre-correction smoke case'
            answer=row.get('answer') or '';refs=set(REF.findall(answer));allowed={s['source_id'] for s in row.get('sources',[])}
            cleaned=answer.lower().replace(',','')
            if row['id']=='DB-002':hit='voting_closed' in cleaned
            elif row['id']=='PDF-005':hit=bool(re.search(r'(?<!\d)12000(?!\d)',cleaned))
            elif row['id']=='MS-001':
                # Only a conservative missing-facts proxy. Repeated 10 is not
                # sufficient to establish database/chain source attribution.
                hit=bool(re.search(r'(?<!\d)12000(?!\d)',cleaned) and len(re.findall(r'(?<!\d)10(?!\d)',cleaned))>=2)
            else:hit=None
            chats=[c for c in row['provider_calls'] if c['path']=='/api/chat']
            inp=[c['response'].get('prompt_eval_count') for c in chats]
            out=[c['response'].get('eval_count') for c in chats]
            result={'id':row['id'],'variant':row['variant'],'eligible':row['eligible'],'exclusion_reason':row['exclusion_reason'],
                'raw_file':row['raw_file'],'raw_line':n,'status':row['status'],'lexical_requested_fact_proxy':hit,
                'valid_reference_ids':len(refs&allowed),'reference_ids':len(refs),'wall_ms':row['wall_ms'],
                'output_origin':row['output_origin'],'model_calls':len(chats),
                'total_observed_chat_input_tokens':sum(inp) if inp and all(v is not None for v in inp) else None,
                'total_observed_chat_output_tokens':sum(out) if out and all(v is not None for v in out) else None,
                'retrieval_ms':row.get('workflow_metrics',{}).get('retrieval_ms'),
                'single_agent_tool_wall_ms':sum(t['ms'] for t in row.get('tool_events',[])) if row['variant']=='B2' else None,
                'automatic_claim_check':verify_claims(answer,row.get('sources',[])),
                'unauthorized_disclosure':None,'human_reviewed':False}
            scored.append(result);all_rows.append(row)
    write('metrics/run_scores.json',scored)
    summaries={}
    for variant in ['B1','B2','B3','B4']:
        rows=[r for r in scored if r['variant']==variant and r['eligible'] and r['lexical_requested_fact_proxy'] is not None]
        auth=[r for r in scored if r['variant']==variant and r['eligible'] and r['id'].startswith('UA')]
        def median(key):
            vals=[r[key] for r in rows if r[key] is not None]
            return st.median(vals) if vals else None
        summaries[variant]={'answer_cases':len(rows),'proxy_hits':sum(r['lexical_requested_fact_proxy'] for r in rows),
            'transport_or_workflow_failures':sum(r['status']=='failed' for r in rows),
            'median_wall_ms':median('wall_ms'),'median_observed_all_chat_input_tokens':median('total_observed_chat_input_tokens'),
            'median_observed_all_chat_output_tokens':median('total_observed_chat_output_tokens'),
            'median_reported_workflow_retrieval_ms':median('retrieval_ms'),
            'valid_reference_ids':sum(r['valid_reference_ids'] for r in rows),'reference_ids':sum(r['reference_ids'] for r in rows),
            'fallback_or_mixed_cases':sum(r['output_origin']=='fallback_or_mixed' for r in rows),
            'real_model_no_fallback_cases':sum(r['output_origin']=='real_model' for r in rows),
            'auth_denials':sum(r['status']=='denied' for r in auth),'auth_cases':len(auth),
            'accuracy_ci':None,'ci_reason':'Three purposive smoke questions from one proposal; dependent, nonrandom observations cannot support population inference',
            'unauthorized_disclosure_rate':None,'abstention_accuracy':None,'semantic_citation_support_rate':None}
    write('metrics/summary.json',summaries)
    paired=[]
    full={r['id']:r for r in scored if r['variant']=='B4' and r['eligible'] and r['lexical_requested_fact_proxy'] is not None}
    for variant in ['B1','B2','B3']:
        baseline={r['id']:r for r in scored if r['variant']==variant and r['eligible'] and r['lexical_requested_fact_proxy'] is not None}
        keys=sorted(full.keys() & baseline.keys())
        paired.append({'baseline':variant,'pairs':len(keys),
            'B4_only_hit':sum(full[k]['lexical_requested_fact_proxy'] and not baseline[k]['lexical_requested_fact_proxy'] for k in keys),
            'baseline_only_hit':sum(baseline[k]['lexical_requested_fact_proxy'] and not full[k]['lexical_requested_fact_proxy'] for k in keys),
            'mean_latency_difference_ms_B4_minus_baseline':st.mean(full[k]['wall_ms']-baseline[k]['wall_ms'] for k in keys),
            'p_value':None,'reason':'No inferential test on three purposive dependent smoke cases'})
    write('metrics/paired_descriptive.json',paired)
    (ROOT/'tables').mkdir(exist_ok=True)
    with (ROOT/'tables/smoke_comparison.csv').open('w',newline='',encoding='utf8') as f:
        writer=csv.DictWriter(f,fieldnames=['variant',*next(iter(summaries.values())).keys()]);writer.writeheader()
        for v,s in summaries.items():writer.writerow({'variant':v,**s})
    # Compact, vector publication artifact; no plotting dependency needed.
    svg=['<svg xmlns="http://www.w3.org/2000/svg" width="760" height="285" viewBox="0 0 760 285">',
         '<rect width="760" height="285" fill="white"/><g font-family="Arial,sans-serif" fill="#172b4d">',
         '<text x="25" y="27" font-size="18">Smoke test requested-fact coverage</text>',
         '<text x="25" y="50" font-size="12">Three purposive questions; descriptive lexical proxy; no population inference</text>']
    for i,(v,s) in enumerate(summaries.items()):
        y=77+i*43; width=140*s['proxy_hits']
        svg.extend([f'<text x="25" y="{y+18}" font-size="14">{v}</text>',f'<rect x="75" y="{y}" width="420" height="27" fill="#edf2f7"/>',
                    f'<rect x="75" y="{y}" width="{width}" height="27" fill="#396a93"/>',
                    f'<text x="510" y="{y+18}" font-size="14">{s["proxy_hits"]}/{s["answer_cases"]} | median {s["median_wall_ms"]/1000:.3f} s</text>'])
    svg+=['<text x="25" y="270" font-size="11">B3/B4 include an off-target fallback. Four contaminated DB-title runs excluded.</text>','</g></svg>']
    (ROOT/'figures').mkdir(exist_ok=True);(ROOT/'figures/smoke_coverage.svg').write_text('\n'.join(svg),encoding='utf8')
    write('metrics/analysis_scope.json',{'raw_attempts':len(scored),'excluded_contaminated':sum(not r['eligible'] for r in scored),
        'valid_answer_attempts':sum(r['eligible'] and r['lexical_requested_fact_proxy'] is not None for r in scored),
        'valid_common_auth_attempts':sum(r['eligible'] and r['id'].startswith('UA') for r in scored),
        'human_reviewed_claims':0,'independent_annotation_available':False,'mock_model_outputs':0,
        'source_replay':'B2/B3/B4 chain calls replay captured real backend responses; no claim of live chain E2E',
        'unanswerable_runs':0})
    print('Analyzed saved smoke attempts; excluded contaminated title question; preserved all failures and provider outputs.')

if __name__=='__main__':main()
