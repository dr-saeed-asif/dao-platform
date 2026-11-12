"""Validate observed generation configuration without interpreting answer quality."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parents[1]
def rows(name):
 p=H/'raw'/name
 return [json.loads(x) for x in p.read_text(encoding='utf8').splitlines()] if p.exists() else []
config=json.loads((H/'b1_configuration.json').read_text());qs=json.loads((H.parent/'research_evaluation/exploratory_frozen_v2/remaining_unexposed_questions.json').read_text());ids={q['id'] for q in qs};raw=rows('responses.jsonl')+rows('frozen_rag_responses.jsonl')+rows('../live_campaign/raw/responses.jsonl');findings=[]
for r in raw:
 assert r['id'] in ids
 for c in r['provider_calls']:
  if c['path']!='/api/chat':continue
  p=c['request']
  if p['model']!=r['model'] or p['options']!=config['options'] or p.get('think') is not False or p.get('stream') is not False or (r['condition'] in ('B1','B2') and 'tools' in p):findings.append({'id':r['id'],'model':r['model'],'condition':r['condition'],'kind':'effective_request_configuration_mismatch'})
  if c.get('http')==200 and c.get('response',{}).get('model')!=r['model']:findings.append({'id':r['id'],'model':r['model'],'condition':r['condition'],'kind':'response_model_mismatch'})
  if 'expected_answer' in json.dumps(p):findings.append({'id':r['id'],'kind':'gold_field_in_prompt'})
  if hashlib.sha256(json.dumps(p).encode()).hexdigest()!=c['request_sha256']:findings.append({'id':r['id'],'model':r['model'],'condition':r['condition'],'kind':'stored_payload_hash_differs_after_redaction'})
keys={(r['id'],r['model'],r['condition']) for r in raw};assert len(keys)==len(raw)
result={'recorded_attempts':len(raw),'duplicate_keys':len(raw)-len(keys),'effective_models':sorted(set(r['model'] for r in raw)),'chat_attempts':sum(c['path']=='/api/chat' for r in raw for c in r['provider_calls']),'options':config['options'],'generation_http_timeout_seconds':100,'overall_case_timeout_seconds':200,'human_validated':False,'findings':findings,'post_redaction_hash_differences':sum(x['kind']=='stored_payload_hash_differs_after_redaction' for x in findings),'configuration_mismatches':sum(x['kind']!='stored_payload_hash_differs_after_redaction' for x in findings),'classification':'Transport/configuration verification, not semantic scoring'}
(H/'transport_configuration_audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps({'records':len(raw),'configuration_findings':len(findings)}))
