"""Analyze the valid matrix and retain all invalid harness attempts separately."""
import csv
import hashlib
import json
import re
import statistics
from collections import Counter
from pathlib import Path
from app.business.agents.claims import verify_claims

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
FIRST=ROOT/'exploratory_frozen_v1'
VERSION=ROOT/'benchmark_200/versions/claude_adjudicated_v3'
REF=re.compile(r'\[((?:D|G|B)\d+)\]')

def read(path):return json.loads(path.read_text(encoding='utf8'))
def rows(path):return [json.loads(s) for s in path.read_text(encoding='utf8').splitlines()]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    first=rows(FIRST/'responses.jsonl');second=rows(HERE/'responses.jsonl')
    exclusions={(x['id'],x['variant']) for x in read(FIRST/'harness_exclusions.json')}
    assert len(first)==32 and len(second)==18 and len(exclusions)==18
    assert {(r['id'],r['variant']) for r in second}==exclusions
    first_cfg=read(FIRST/'config.json');second_cfg=read(HERE/'config.json')
    for key in ['ids','model_digests','table_fingerprints','baseline_sha256','verifier_source_sha256','verifier_compiled_sha256']:
        assert first_cfg[key]==second_cfg[key],key
    assert sha(FIRST/'chain_snapshot.json')==sha(HERE/'chain_snapshot.json')
    assert sha(FIRST/'run.py')==first_cfg['runner_sha256'] and sha(HERE/'run.py')==second_cfg['runner_sha256']
    matrix=[]
    for folder,observations in [(FIRST,first),(HERE,second)]:
        for line,row in enumerate(observations,1):
            if folder==FIRST and (row['id'],row['variant']) in exclusions:continue
            row={**row,'raw_file':folder.name+'/responses.jsonl','raw_line':line}
            matrix.append(row)
    assert len(matrix)==len({(r['id'],r['variant']) for r in matrix})==32
    ratings=read(HERE/'assistant_ratings.json');scores=[]
    for row in matrix:
        answer=row.get('answer') or '';refs=set(REF.findall(answer));known={s['source_id'] for s in row.get('sources',[])}
        whole,abstention,note=ratings['ratings'][row['id']][row['variant']]
        chats=[c for c in row['provider_calls'] if c['path']=='/api/chat']
        inputs=[c['response'].get('prompt_eval_count') for c in chats];outputs=[c['response'].get('eval_count') for c in chats]
        scores.append({'id':row['id'],'variant':row['variant'],'raw_file':row['raw_file'],'raw_line':row['raw_line'],
            'status':row['status'],'whole_answer_AI_rating':whole,'abstention_AI_rating':abstention,'rating_note':note,
            'human_adjudication':'pending','rating_method':'same-assistant post-hoc source inspection; exploratory',
            'wall_ms':row['wall_ms'],'output_origin':row['output_origin'],'provider_chat_calls':len(chats),
            'input_tokens':sum(inputs) if inputs and all(v is not None for v in inputs) else None,
            'output_tokens':sum(outputs) if outputs and all(v is not None for v in outputs) else None,
            'provider_http_failures':sum(c['http']>=400 for c in row['provider_calls']),
            'available_sources':len(known),'valid_reference_ids':len(refs&known),'reference_ids':len(refs),
            'automatic_claim_check':verify_claims(answer,row.get('sources',[]))})
    summary={}
    for variant in ['B1','B2','B3','B4']:
        group=[r for r in scores if r['variant']==variant]
        def median(key):
            values=[r[key] for r in group if r[key] is not None]
            return statistics.median(values) if values else None
        summary[variant]={'n':len(group),'whole_answer_AI_counts':dict(Counter(r['whole_answer_AI_rating'] for r in group)),
            'abstention_AI_counts':dict(Counter(r['abstention_AI_rating'] for r in group)),
            'outer_failures':sum(r['status']=='failed' for r in group),'provider_http_failures':sum(r['provider_http_failures'] for r in group),
            'fallback_or_mixed':sum(r['output_origin']=='fallback_or_mixed' for r in group),
            'answer_unavailable':sum(r['abstention_AI_rating']=='technical_unavailability' for r in group),
            'median_wall_ms':median('wall_ms'),'min_wall_ms':min(r['wall_ms'] for r in group),'max_wall_ms':max(r['wall_ms'] for r in group),
            'median_all_chat_input_tokens':median('input_tokens'),'median_all_chat_output_tokens':median('output_tokens'),
            'valid_reference_ids':sum(r['valid_reference_ids'] for r in group),'reference_ids':sum(r['reference_ids'] for r in group),
            'independent_human_correctness':None,'independent_claim_support':None,'population_confidence_interval':None,
            'uncertainty_limit':'Eight purposive cases from two proposals, one model observation per case and post-hoc AI ratings; no population or confirmatory interval'}
    claims=list(csv.DictReader((HERE/'diagnostic_claims.csv').open(encoding='utf8')))
    assert len(claims)==18
    for claim in claims:
        assert any(r['id']==claim['id'] and r['variant']==claim['variant'] for r in matrix)
    claim_summary={'sample_n':18,'returned_evidence_support':dict(Counter(c['returned_evidence_support'] for c in claims)),
        'authoritative_truth':dict(Counter(c['authoritative_truth'] for c in claims)),
        'method':'Purposive diagnostic assertions reviewed by same research assistant; not exhaustive and not a general support-rate estimate',
        'human_review':'pending'}
    manifest={'raw_attempts':50,'first_campaign':32,'corrected_affected_retests':18,'harness_invalid_excluded':18,
        'harness_defects':['FrozenPool omitted connection timeout parameter','RunRecorder dataclass incorrectly treated as Pydantic model'],
        'unaffected_first_campaign_retained':14,'comparison_records':32,'per_variant':8,
        'raw_status_counts':dict(Counter(r['status'] for r in first+second)),
        'selected_status_counts':dict(Counter(r['status'] for r in matrix)),
        'human_adjudicated':0,'SQL_fingerprints_match':True,'same_chain_snapshot_bytes':True,
        'remaining_unexposed':133,'whole_answer_AI_ratings_posthoc':True}
    for name,obj in [('scores.json',scores),('summary.json',summary),('claim_sample_summary.json',claim_summary),('analysis_manifest.json',manifest)]:
        (HERE/name).write_text(json.dumps(obj,indent=2),encoding='utf8')
    with (HERE/'baseline_comparison.csv').open('w',newline='',encoding='utf8') as f:
        w=csv.writer(f);w.writerow(['variant','n','AI_correct','AI_incorrect','AI_unanswered','technical_unavailability','median_wall_ms','input_tokens_median','output_tokens_median','valid_reference_ids','reference_ids'])
        for v,s in summary.items():w.writerow([v,s['n'],s['whole_answer_AI_counts'].get('correct',0),s['whole_answer_AI_counts'].get('incorrect',0),s['whole_answer_AI_counts'].get('unanswered',0),s['answer_unavailable'],s['median_wall_ms'],s['median_all_chat_input_tokens'],s['median_all_chat_output_tokens'],s['valid_reference_ids'],s['reference_ids']])
    originals=read(VERSION/'confirmatory_questions.json');used=set(first_cfg['ids'])
    remaining=[q for q in originals if q['id'] not in used]
    assert len(remaining)==133
    (HERE/'exposure_ledger.json').write_text(json.dumps({'previous_reserved':141,'newly_exposed_ids':sorted(used),'remaining':133,
        'scope':'Both valid and harness-invalid model prompts expose a question; original v3 files preserved'},indent=2),encoding='utf8')
    (HERE/'remaining_unexposed_questions.json').write_text(json.dumps(remaining,indent=2,ensure_ascii=False),encoding='utf8')
    print('32 comparison records; 18 harness-invalid attempts retained; AI correct', {v:s['whole_answer_AI_counts'].get('correct',0) for v,s in summary.items()})

if __name__=='__main__':main()
