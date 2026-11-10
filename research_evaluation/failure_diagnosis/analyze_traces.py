"""Offline taxonomy for existing raw outputs; no generation or result modification."""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from app.business.agents.quality import verify_citations
from app.business.agents.synthesis import supported_amounts
from app.business.agents.models import CitedSource

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
FIRST=ROOT/'exploratory_frozen_v1'
SECOND=ROOT/'exploratory_frozen_v2'

def load(path):return json.loads(path.read_text(encoding='utf8'))
def rows(path):return [json.loads(x) for x in path.read_text(encoding='utf8').splitlines()]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    old=rows(FIRST/'responses.jsonl');new=rows(SECOND/'responses.jsonl')
    excluded={(r['id'],r['variant']) for r in load(FIRST/'harness_exclusions.json')}
    classifications=[]
    for line,r in enumerate(old,1):
        if (r['id'],r['variant']) not in excluded:continue
        tool_names=[s.get('name') for s in r.get('spans',[]) if s.get('kind')=='tool']
        if r['variant']=='B2':tool_names=[s['name'] for s in r.get('tool_events',[])]
        direct_dataclass=any('model_dump' in error for w in r.get('worker_results',[]) for error in w.get('errors',[]))
        classifications.append({'id':r['id'],'variant':r['variant'],'raw_file':'exploratory_frozen_v1/responses.jsonl','line':line,
            'primary_failure':'recorder_dataclass_AttributeError' if direct_dataclass else 'pool_connection_timeout_protocol',
            'observed_tool_names':tool_names,'raw_status':r['status'],
            'attribution_basis':'Direct AttributeError recorded' if direct_dataclass else 'Source/preflight confirmed missing connection(timeout); masked SQL-backed tool results',
            'exclusion':'Harness-invalid; retain raw row; affected retest is a new observation'})
    assert len(classifications)==18
    accepted=[]
    for folder,data in [(FIRST,old),(SECOND,new)]:
        for line,r in enumerate(data,1):
            if folder==FIRST and (r['id'],r['variant']) in excluded:continue
            accepted.append({**r,'raw_file':folder.name+'/responses.jsonl','raw_line':line})
    assert len(accepted)==32
    full=[];options=[]
    for r in accepted:
        chats=[c for c in r['provider_calls'] if c['path']=='/api/chat']
        options.extend({'id':r['id'],'variant':r['variant'],'call':i+1,'model':c['model'],'options':c['options'],'HTTP':c['http'],
            'done_reason':c['response'].get('done_reason'),'raw_file':r['raw_file'],'raw_line':r['raw_line']} for i,c in enumerate(chats))
        if r['variant'] not in ['B3','B4']:continue
        tools=[s for s in r['spans'] if s.get('kind')=='tool']
        synthesis=[s for s in r['spans'] if s.get('kind')=='agent' and s.get('agent')=='synthesis']
        text=chats[-1]['response'].get('message',{}).get('content','')
        route=r['id'] in ['DB-006','DB-016','MS-002','MS-026']
        format_failure=any(s['status']=='failed' for s in synthesis) and not re.search(r'(?im)^\s*TASK\s+q1\s*:',text)
        citation_failure=any(s['status']=='failed' for s in synthesis) and not format_failure
        full.append({'id':r['id'],'variant':r['variant'],'raw_file':r['raw_file'],'raw_line':r['raw_line'],
            'worker_agents':[w['agent'] for w in r['worker_results']],
            'tool_names':[s['name'] for s in tools],
            'routing_or_source_coverage_failure':route,
            'retrieval_tool_error':any(s.get('status')=='failed' for s in tools if s['name']=='search_proposal_evidence'),
            'retrieved_source_count':sum(len(w.get('cited_sources',[])) for w in r['worker_results']),
            'TASK_header_format_failure':format_failure,'synthesis_citation_gate_rejection':citation_failure,
            'wrong_budget_label_generation':r['id']=='MS-002',
            'off_target_count_generation':r['id']=='MS-026',
            'transport_failure':any(c['http']>=400 for c in chats),
            'provider_nonempty_and_stopped':bool(text) and chats[-1]['response'].get('done_reason')=='stop',
            'output_origin':r['output_origin']})
    assert len(full)==16
    claims=[]
    for r in accepted:
        if r['id']=='MS-002' and r['variant'] in ['B3','B4']:
            sources=r['sources'];typed=[CitedSource(**s) for s in sources]
            structural=verify_citations(r['answer'],sources)
            amounts=supported_amounts(r['answer'],typed,r['question'])
            d1=next(s['content'] for s in sources if s['source_id']=='D1')
            assert 'Independent security review' in d1 and 'EUR 6,000' in d1
            assert 'Governance dashboard improvements' in d1 and 'EUR 3,000' in d1
            for amount,wrong,right in [('6000','governance dashboard improvements','independent security review'),('3000','AI evaluation','governance dashboard improvements')]:
                claims.append({'id':r['id'],'variant':r['variant'],'amount':amount,'generated_label':wrong,'source_label':right,
                    'source_id':'D1','source_content_sha256':hashlib.sha256(d1.encode()).hexdigest(),
                    'full_answer_reference_check_valid':structural['valid'],'full_answer_currency_presence_check':amounts,
                    'semantic_support':'contradicted by budget row','reviewer':'same AI research assistant; human review pending',
                    'active_runtime_verification':r['variant']=='B4',
                    'raw_file':r['raw_file'],'raw_line':r['raw_line']})
    configs=[load(FIRST/'config.json'),load(SECOND/'config.json')]
    checks={k:configs[0][k]==configs[1][k] for k in ['ids','model_digests','table_fingerprints','baseline_sha256','verifier_source_sha256','verifier_compiled_sha256']}
    checks['chain_bytes_match']=sha(FIRST/'chain_snapshot.json')==sha(SECOND/'chain_snapshot.json')
    checks['current_baseline_matches_manifest']=sha(ROOT/'benchmark_200/scripts/run.py')==configs[0]['baseline_sha256']
    assert all(checks.values())
    scores=load(SECOND/'scores.json');summary=load(SECOND/'summary.json');rating=load(SECOND/'assistant_ratings.json')['ratings']
    assert len(scores)==len({(r['id'],r['variant']) for r in scores})==32
    for variant,s in summary.items():
        counted=Counter(r['whole_answer_AI_rating'] for r in scores if r['variant']==variant)
        assert dict(counted)==s['whole_answer_AI_counts']
        for row in [r for r in scores if r['variant']==variant]:assert row['whole_answer_AI_rating']==rating[row['id']][variant][0]
    summary_report={
        'excluded_attempts':18,'excluded_primary_classes':dict(Counter(r['primary_failure'] for r in classifications)),
        'selected_records':32,'full_workflow_records':16,'routing_or_coverage_failures':sum(r['routing_or_source_coverage_failure'] for r in full),
        'retrieval_execution_errors':sum(r['retrieval_tool_error'] for r in full),
        'full_workflow_records_with_returned_worker_sources':sum(r['retrieved_source_count']>0 for r in full),
        'completed_evidence_searches':sum('search_proposal_evidence' in r['tool_names'] for r in full),
        'completed_DAO_count_queries':sum('count_dao_proposals' in r['tool_names'] for r in full),
        'synthesis_header_format_failures':sum(r['TASK_header_format_failure'] for r in full),
        'synthesis_citation_rejections':sum(r['synthesis_citation_gate_rejection'] for r in full),
        'full_workflow_HTTP_or_empty_provider_failures':sum(r['transport_failure'] or not r['provider_nonempty_and_stopped'] for r in full),
        'wrong_budget_claims_that_passed_B4_gate':2,'wrong_budget_claims_in_B3_without_gate':2,
        'unsupported_budget_label_answers':sum(r['wrong_budget_label_generation'] for r in full),
        'off_target_DAO_count_answers':sum(r['off_target_count_generation'] for r in full),
        'source_config_checks':checks,'deterministic_score_aggregation_errors':0,
        'independent_human_reviewed_scores':0,'taxonomy_note':'Failure categories overlap. Protocol attribution on masked initial errors uses code and preflight evidence; complete underlying exception details were not retained in every raw wrapper.'}
    for name,obj in [('excluded_attempt_taxonomy.json',classifications),('full_workflow_taxonomy.json',full),
                     ('provider_options.json',options),('budget_claim_errors.json',claims),('taxonomy_summary.json',summary_report)]:
        (HERE/name).write_text(json.dumps(obj,indent=2),encoding='utf8')
    with (HERE/'failure_counts.csv').open('w',newline='',encoding='utf8') as f:
        w=csv.writer(f);w.writerow(['metric','count','denominator'])
        for key,n in [('routing_or_coverage_failures',16),('retrieval_execution_errors',16),('synthesis_header_format_failures',16),('synthesis_citation_rejections',16)]:w.writerow([key,summary_report[key],n])
    with (HERE/'excluded_attempt_taxonomy.csv').open('w',newline='',encoding='utf8') as f:
        fields=['id','variant','raw_file','line','primary_failure','raw_status','attribution_basis']
        writer=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');writer.writeheader();writer.writerows(classifications)
    with (HERE/'answerability_strata.csv').open('w',newline='',encoding='utf8') as f:
        writer=csv.writer(f);writer.writerow(['variant','stratum','n','AI_correct','AI_incorrect','AI_unanswered'])
        for variant in ['B1','B2','B3','B4']:
            for unknown in [False,True]:
                group=[r for r in scores if r['variant']==variant and r['id'].startswith('UN-')==unknown]
                counts=Counter(r['whole_answer_AI_rating'] for r in group)
                writer.writerow([variant,'bounded_unknown' if unknown else 'answerable',len(group),counts['correct'],counts['incorrect'],counts['unanswered']])
    print(json.dumps({k:v for k,v in summary_report.items() if isinstance(v,int)}))

if __name__=='__main__':main()
