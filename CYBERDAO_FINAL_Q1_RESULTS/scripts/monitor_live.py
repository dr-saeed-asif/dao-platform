"""Low-volume progress monitoring; never executes or retries model cases."""
import collections,datetime,json,time
from pathlib import Path
H=Path(__file__).resolve().parents[1];L=H/'live_campaign'
while True:
 if (L/'completion.json').exists():print('Live execution complete; finalizer is deriving reports and hashes',flush=True);break
 path=L/'raw/responses.jsonl';records=[]
 if path.exists():
  for line in path.read_text(encoding='utf8').splitlines():
   try:records.append(json.loads(line))
   except json.JSONDecodeError:pass
 state={'written_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'completed_B1_frozen_RAG':532,'live_saved':len(records),'live_planned':1330,'saved_model_attempts':532+len(records),'direct_SQL_completed':26,'live_pipeline_pid':29456,'finalizer_pid':44980,'latest_model':records[-1]['model'] if records else None,'latest_condition':records[-1]['condition'] if records else None,'human_annotations':0,'status':'exploratory campaign running','preservation':'Do not rerun completed keys or old pilot/recovery/document experiments','finish':'Finalizer runs analyze.py, report_live.py, check_transport.py, figures.py, seal.py after completion. Check live_campaign/raw/finalizer-error.log for blockers.'}
 if (L/'completion.json').exists():break
 (H/'CONTINUATION_STATE.json').write_text(json.dumps(state,indent=2)+'\n',encoding='utf8')
 with (H/'raw/live_campaign_progress.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps(state)+'\n')
 print(json.dumps({k:state[k] for k in ['saved_model_attempts','live_saved','live_planned','latest_model','latest_condition']}),flush=True)
 time.sleep(45)
