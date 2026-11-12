"""Audit retained provenance and score a post-development synthetic challenge."""
import csv,hashlib,importlib.util,json,sys
from collections import Counter
from pathlib import Path
HERE=Path(__file__).resolve().parents[1];DAO=HERE.parent;ROOT=DAO/'research_evaluation';AI=Path('E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(name,x): (HERE/name).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
manifest=read(ROOT/'ai_independent_part2_v1/AI_REPRODUCIBILITY_MANIFEST.json')
checks=[]
for name,h in manifest['files'].items():
 p=AI/name[3:] if name.startswith('ai/') else DAO/name
 checks.append({'path':name,'matches':p.is_file() and sha(p)==h})
assert all(x['matches'] for x in checks)
qs=read(ROOT/'exploratory_frozen_v2/remaining_unexposed_questions.json');gold={x['id']:x for x in read(ROOT/'benchmark_200/versions/claude_adjudicated_v3/confirmatory_gold.json')}
assert len(qs)==len(set(x['id'] for x in qs))==133 and all(x['id'] in gold for x in qs)
source=read(ROOT/'benchmark_200/evidence/snapshot.json');source_hash=sha(ROOT/'benchmark_200/evidence/snapshot.json')
question_texts=[x['question'].strip().casefold() for x in qs];assert len(set(question_texts))==133
save('evidence/provenance_audit.json',{'previous_hashes_checked':len(checks),'previous_hashes_matching':sum(x['matches'] for x in checks),'reserved_n':133,'categories':dict(Counter(x['category'] for x in qs)),'reserved_sha256':sha(ROOT/'exploratory_frozen_v2/remaining_unexposed_questions.json'),'source_snapshot_sha256':source_hash,'all_reserved_ids_have_provisional_gold':True,'exact_question_duplicates':133-len(set(question_texts)),'hash_checks':checks})
# New labels are authored here after development; they are NOT independently held-out gold.
# No implementation changes are made in response to these measurements.
cases=[]
def add(identifier,answer,content,gold,reason):
 cases.append({'id':identifier,'answer':answer,'sources':[{'source_id':'D1','content':content}],'gold':gold,'label_reason':reason})
text='Venue rental: EUR 720; Travel: EUR 180; Insurance: EUR 180; Duration: 9 days.'
for identifier,answer,label,reason in [
 ('CH-001','Venue rental is EUR 720 [D1].','supported','Explicit labeled field/value/currency'),
 ('CH-002','Travel is EUR 180 [D1].','supported','Explicit matching travel row'),
 ('CH-003','Insurance is EUR 180 [D1].','supported','Repeated amount under a different valid field'),
 ('CH-004','Duration is 9 days [D1].','supported','Matching measurement unit'),
 ('CH-005','Venue rental is EUR 180 [D1].','contradicted','Swapped field value exists elsewhere'),
 ('CH-006','Travel is EUR 720 [D1].','contradicted','Swapped amount belongs to venue'),
 ('CH-007','Insurance is USD 180 [D1].','contradicted','Wrong currency'),
 ('CH-008','Duration is 9 hours [D1].','contradicted','Wrong unit'),
 ('CH-009','Travel is EUR 999 [D1].','unsupported','Absent amount'),
 ('CH-010','Travel is EUR 180.','supported','True relation, but missing required citation'),
 ('CH-011','Travel is EUR 180 [D99].','supported','True relation, but wrong citation identifier'),
 ('CH-012','Catering is EUR 180 [D1].','unsupported','Amount exists, label absent'),
 ('CH-013','Travel is 180 [D1].','ambiguous','Currency omitted'),
 ('CH-014','The amount is EUR 180 [D1].','ambiguous','Requested field missing'),
 ('CH-015','There are no additional expenses [D1].','closed_world','Excerpt cannot establish completeness'),
 ('CH-016','All proposals have been verified [D1].','closed_world','No evidence of complete verification')]:add(identifier,answer,text,label,reason)
add('CH-017','Travel is EUR 180 [D1].','Travel: EUR 180; Travel: EUR 200.','ambiguous','Conflicting field values')
add('CH-018','Travel is EUR 180 [D1].','Travel Insurance\nEUR 180 EUR 200','ambiguous','Ambiguous extracted table alignment')
# Genuine archived PDF extraction tests. Explicit semantic gold does not assume the parser supports the layout.
pilot=source['documents']['pilot']['pages'][0];training=source['documents']['training']['pages'][0]
for identifier,answer,content,label,reason in [
 ('CH-019','Security review is EUR 6,000 [D1].',pilot,'supported','Provisional source-table interpretation of original pilot PDF'),
 ('CH-020','Dashboard improvements is EUR 6,000 [D1].',pilot,'contradicted','Wrong allocation in original pilot PDF'),
 ('CH-021','Workshop preparation and facilitation is EUR 2,000 [D1].',training,'supported','Provisional source-table interpretation of training PDF'),
 ('CH-022','Training guides and learning materials is EUR 2,000 [D1].',training,'contradicted','Training PDF assigns EUR 1,500 to this field'),
 ('CH-023','No other information is available [D1].',training,'closed_world','Excerpt completeness not established'),
 ('CH-024','Duration is 90 days [D1].',training,'unsupported','Document specifies 21-day initiative, not 90')]:add(identifier,answer,content,label,reason)
dataset={'version':'post-development-challenge-v1','label_provenance':'AI-authored synthetic/provisional source-based labels; no human adjudication; implementation frozen before evaluation; not independent held-out evaluation','source_sha256':source_hash,'cases':cases}
save('evidence/claim_challenge_v1.json',dataset)
sys.path.insert(0,str(AI));from app.business.agents.claims import verify_claims
spec=importlib.util.spec_from_file_location('m7_evaluate',AI/'benchmark/m7/evaluate.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
result=module.measure(cases,verify_claims)
# CH-010/011 are semantically supported but fail required evidence attribution; report that distinction.
save('raw/claim_challenge_results.json',{'dataset':dataset['version'],'label_provenance':dataset['label_provenance'],'field_aware':result,'claim_module_sha256':sha(AI/'app/business/agents/claims.py'),'attribution_note':'CH-010/011 are factually true but deliberately lack valid cited support; binary semantic-support recall includes these as false negatives; attribution-aware results reported separately'})
with (HERE/'CLAIM_VERIFICATION_RESULTS.csv').open('w',newline='',encoding='utf8') as f:
 writer=csv.DictWriter(f,fieldnames=['dataset','id','gold','status','human_validated']);writer.writeheader()
 for row in result['predictions']:writer.writerow({'dataset':dataset['version'],**row,'human_validated':False})
print(json.dumps({'hashes_verified':len(checks),'questions':len(qs),'challenge':{k:v for k,v in result.items() if k not in ('predictions','matrix')},'matrix':result['matrix']}))

