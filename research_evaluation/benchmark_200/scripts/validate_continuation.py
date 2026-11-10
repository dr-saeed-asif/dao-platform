"""Offline consistency checks for preserved observations and continuation artifacts."""
import hashlib,json,re,statistics as st
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    prior=json.loads((ROOT/'archive/provenance_before_continuation.json').read_text(encoding='utf8'))
    frozen=[]
    for path,sha in prior['files'].items():
        if path.startswith(('raw_results/','evidence/')) or path in ['questions.json','questions_verified.json','ground_truth.json','quality.json']:
            assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha,path
            frozen.append(path)
    raw=[json.loads(s) for s in (ROOT/'raw_results/source-counts-v1/responses.jsonl').read_text(encoding='utf8').splitlines()]
    config=json.loads((ROOT/'raw_results/source-counts-v1/config.json').read_text(encoding='utf8'))
    assert len(raw)==32 and len({(r['id'],r['variant']) for r in raw})==32
    old=[json.loads(s) for p in [ROOT/'raw_results/smoke/responses.jsonl',ROOT/'raw_results/smoke-v2/responses.jsonl'] for s in p.read_text(encoding='utf8').splitlines()]
    assert not {r['id'] for r in old}&{r['id'] for r in raw}
    assert config['script_sha256']==hashlib.sha256((ROOT/'archive/source_counts_v1_runner.py').read_bytes()).hexdigest()
    assert config['questions_sha256']==hashlib.sha256((ROOT/'questions_verified.json').read_bytes()).hexdigest()
    scores=json.loads((ROOT/'metrics/subset_scores.json').read_text(encoding='utf8'));summary=json.loads((ROOT/'metrics/subset_summary.json').read_text(encoding='utf8'))
    for variant,s in summary.items():
        group=[r for r in scores if r['variant']==variant]
        assert len(group)==s['attempts']==8
        assert sum(r['requested_count_proxy_hit'] for r in group)==s['requested_count_proxy_hits']
        assert st.median(r['wall_ms'] for r in group)==s['median_wall_ms']
    assert len(json.loads((ROOT/'review/quarantine_25.json').read_text(encoding='utf8')))==25
    assert len(json.loads((ROOT/'review/item_source_audit.json').read_text(encoding='utf8')))==200
    replacements=json.loads((ROOT/'review/replacement_candidates_25.json').read_text(encoding='utf8'))
    assert len(replacements)==25 and all(r['independent_validation']=='pending' and r['admission_status'].startswith('not_admitted') for r in replacements)
    snapshot=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
    for r in replacements:
        text=snapshot['documents'][r['scope_label']]['pages'][r['page']-1]
        assert re.sub(r'\s+',' ',r['exact_quote']).casefold() in re.sub(r'\s+',' ',text).casefold()
    for name in ['FINAL_REPORT.md','CONTINUATION_RESULTS.md','README.md']:
        p=ROOT/name
        for target in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf8')):assert (p.parent/target).exists(),target
    result={'frozen_prior_observation_artifacts_verified':len(frozen),'prior_attempts':20,'new_attempts':32,
        'duplicate_or_repeated_question_ids_between_campaigns':0,'independent_gold_validations':0,'population_CI_available':False,
        'source_question_rows_audited':200,'replacement_anchors_verified':25,'benchmark_rebuilt':False,'production_modified':False}
    (ROOT/'review/continuation_validation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print('Preserved prior measurements verified; 32 new unique attempts, calculations and review anchors validated.')

if __name__=='__main__':main()
