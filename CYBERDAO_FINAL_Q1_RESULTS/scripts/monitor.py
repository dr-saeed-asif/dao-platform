"""Monitor the existing run; no models or evaluation variants are started here."""
import collections,datetime,json,time
from pathlib import Path
H=Path(__file__).resolve().parents[1]
while True:
 p=H/'raw/frozen_rag_responses.jsonl';lines=p.read_text(encoding='utf8').splitlines() if p.exists() else [];rows=[]
 for line in lines:
  try:rows.append(json.loads(line))
  except json.JSONDecodeError:pass # monitor only; never edits/truncates the raw file
 large=[r for r in rows if r['model']=='qwen3:4b-instruct'];record={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'RAG_saved_records':len(rows),'RAG_4B_saved':len(large),'RAG_4B_failures':sum(r['status']!='completed' for r in large)}
 with (H/'raw/campaign_progress.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps(record)+'\n')
 print(json.dumps(record),flush=True)
 if (H/'b2_completion.json').exists():break
 time.sleep(45)
