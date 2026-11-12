"""Read-only consistency checks on historical artifacts; no experiments rerun."""
import collections,csv,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parents[1];R=H.parent/'research_evaluation'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def rows(p):return [json.loads(s) for s in p.read_text(encoding='utf8').splitlines()]
def table(p):return list(csv.DictReader(p.open(encoding='utf-8-sig',newline='')))
pilot=rows(R/'raw_results/pilot-small/runs.jsonl');assert len(pilot)==32
recovery=table(R/'recovery_completeness/results-01/RECOVERY_COMPARISON.csv');assert len(recovery)==39 and len({x['on_chain_id'] for x in recovery})==39
m=table(R/'m5_m6_postfix/M5_M6_POST_FIX_RESULTS.csv');assert len(m)==31
faults=rows(R/'m5_m6_postfix/m6/raw.jsonl');assert len(faults)==16
stream=rows(R/'raw_results/http-stream.jsonl');assert len(stream)==3
result={'pilot_records':len(pilot),'pilot_by_mode':dict(collections.Counter(x['mode'] for x in pilot)),'pilot_statuses':dict(collections.Counter(x['status'] for x in pilot)),
'recovery_cohort_n':len(recovery),'recovery_outcomes':dict(collections.Counter(x['new_outcome'] for x in recovery)),
'postfix_cases':dict(collections.Counter(x['experiment'] for x in m)),'postfix_expected_matches':sum(x['correct']=='True' for x in m),'M6_raw_records':len(faults),'streaming_records':len(stream),
'source_hashes':{str(p.relative_to(R)):sha(p) for p in [R/'raw_results/pilot-small/runs.jsonl',R/'recovery_completeness/results-01/RECOVERY_COMPARISON.csv',R/'m5_m6_postfix/M5_M6_POST_FIX_RESULTS.csv',R/'m5_m6_postfix/m6/raw.jsonl',R/'raw_results/http-stream.jsonl']}}
(H/'evidence/historical_crosschecks.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result,default=str))
