"""Correct only the two challenge fixtures citing pilot page 1 instead of budget page 2.
Original dataset and all 24 original measurements are retained unchanged.
"""
import csv,hashlib,importlib.util,json,sys
from pathlib import Path
H=Path(__file__).resolve().parents[1];AI=Path('E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server');R=H.parent/'research_evaluation'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,x):p.write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
d=read(H/'evidence/claim_challenge_v1.json');snapshot=read(R/'benchmark_200/evidence/snapshot.json')
pages=snapshot['documents']['pilot']['pages'];page=next(x for x in pages if '6,000' in x);assert '3,000' in page
changed=[]
for c in d['cases']:
 if c['id'] in ('CH-019','CH-020'):
  assert '6,000' not in c['sources'][0]['content'];c['sources'][0]['content']=page;c['source_page_number']=pages.index(page)+1;changed.append(c)
d['version']='post-development-challenge-v2';d['construction_correction']='CH-019/020 originally cited page 1 without budget amounts. Only evidence page corrected to original PDF page 2; labels and answers unchanged. Original attempts excluded from final source-valid panel, not erased.'
save(H/'evidence/claim_challenge_v2.json',d)
sys.path.insert(0,str(AI));from app.business.agents.claims import verify_claims
spec=importlib.util.spec_from_file_location('eval_m7',AI/'benchmark/m7/evaluate.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
new=m.measure(changed,verify_claims);save(H/'raw/claim_challenge_targeted_correction.json',new)
old=read(H/'raw/claim_challenge_results.json');by_id={x['id']:x for x in old['field_aware']['predictions']};by_id.update({x['id']:x for x in new['predictions']})
# Aggregate already recorded statuses, without rerunning the 22 unaffected checks.
rows=list(by_id.values());matrix={g:{p:0 for p in ['accept','reject','abstain']} for g in ['supported','contradicted','unsupported','ambiguous','closed_world']}
for r in rows:matrix[r['gold']]['accept' if r['status']=='supported' else 'abstain' if r['status'] in ['unchecked_cited','non_factual'] else 'reject']+=1
p=sum(matrix['supported'].values());tp=matrix['supported']['accept'];fp=sum(v['accept'] for k,v in matrix.items() if k!='supported');ab=sum(v['abstain'] for v in matrix.values())
result={'n':24,'actual_gate_attempts_total':26,'invalid_source_attempts_preserved':2,'matrix':matrix,'predictions':rows,'tp':tp,'fp':fp,'fn':p-tp,'tn':24-p-fp,'precision':tp/(tp+fp) if tp+fp else None,'recall':tp/p,'false_positive_rate':fp/(24-p),'false_negative_rate':(p-tp)/p,'abstention_rate':ab/24,'classification_coverage':(24-ab)/24,'source':'22 original valid attempts plus 2 targeted source corrections','human_validated':False}
save(H/'raw/claim_challenge_final_panel.json',result)
with (H/'CLAIM_VERIFICATION_RESULTS.csv').open('w',newline='',encoding='utf8') as f:
 w=csv.DictWriter(f,fieldnames=['dataset','id','gold','status','human_validated','attempt_version']);w.writeheader()
 for row in rows:w.writerow({'dataset':d['version'],**row,'human_validated':False,'attempt_version':'v2' if row['id'] in ['CH-019','CH-020'] else 'v1'})
print(json.dumps({k:v for k,v in result.items() if k not in ['matrix','predictions']}))
