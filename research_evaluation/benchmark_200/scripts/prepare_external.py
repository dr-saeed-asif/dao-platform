"""Draft replacement version and blind review materials, never a release."""
import csv,hashlib,json
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    q=json.loads((ROOT/'questions.json').read_text(encoding='utf8'))
    gold=json.loads((ROOT/'ground_truth.json').read_text(encoding='utf8'))
    snapshot=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
    replacement=json.loads((ROOT/'review/replacement_candidates_25.json').read_text(encoding='utf8'))
    proposed=[x.copy() for x in q if x['category']!='UN'];pg=[x.copy() for x in gold if not x['id'].startswith('UN-')]
    # DB-021's title equals its model-visible DAO identifier. Replace only in
    # the reviewer draft; original questions/gold and runs stay unchanged.
    db=snapshot['database']['cleanup']
    seconds=int((datetime.fromisoformat(db['ends_at'])-datetime.fromisoformat(db['starts_at'])).total_seconds())
    replacement_db={'replacement_id':'DB-R021','supersedes_proposed':'DB-021','question':'How long is the selected cleanup proposal database voting window in seconds?',
        'expected_answer':str(seconds),'source_identifiers':['database/cleanup/starts_at','database/cleanup/ends_at'],
        'source_operands':{'starts_at':db['starts_at'],'ends_at':db['ends_at']},
        'source_check':'same-assistant timestamp subtraction','independent_validation':'pending','admission_status':'not_admitted'}
    (ROOT/'review/replacement_leaked_title.json').write_text(json.dumps(replacement_db,indent=2),encoding='utf8')
    for item in proposed:
        if item['id']=='DB-021':item.update(id='DB-R021',question=replacement_db['question'],semantic_target=['cleanup','db','voting_window_seconds'],admission_status='external review pending')
    for item in pg:
        if item['id']=='DB-021':item.update(id='DB-R021',expected_answer=str(seconds),source_identifiers=replacement_db['source_identifiers'],
            semantic_target=['cleanup','db','voting_window_seconds'],support_anchors=[str(seconds)],
            verification_method='Same-assistant timestamp subtraction from captured SQL fields',human_review_status='not_reviewed',admission_status='not_admitted')
    for r in replacement:
        label=r['scope_label'];db=snapshot['database'][label]
        proposed.append({'id':r['replacement_id'],'category':'UN','question':r['question'],'dao':db['dao_id'],'proposal':db['id'],
            'scope_label':label,'permission':'operator_read_only','difficulty':'unrated','semantic_target':['PDF-bounded-absence',r['replacement_id']],
            'admission_status':'external review pending'})
        pg.append({'id':r['replacement_id'],'expected_answer':r['expected_answer'],'expected_behavior':r['expected_behavior'],
            'source_identifiers':[r['authoritative_source']+' page '+str(r['page'])],
            'source_pdf_sha256':r['source_pdf_sha256'],'exact_quote':r['exact_quote'],'source_check':'same-assistant quote anchoring passed',
            'evidence_snapshot':'evidence/snapshot.json','snapshot_sha256':hashlib.sha256((ROOT/'evidence/snapshot.json').read_bytes()).hexdigest(),
            'independent_ground_truth_validation':'not_performed','admission_status':'not_admitted'})
    assert len(proposed)==200 and len({x['id'] for x in proposed})==200
    sheet=ROOT/'review/external_review_sheet.csv'
    existing={x['id'] for x in csv.DictReader(sheet.open(encoding='utf8'))}
    if 'DB-R021' not in existing:
        with sheet.open('a',newline='',encoding='utf8') as f:
            w=csv.writer(f);w.writerow(['DB-R021','DB-proposed',replacement_db['question'],str(seconds),
                'database/cleanup/starts_at | database/cleanup/ends_at',hashlib.sha256((ROOT/'evidence/snapshot.json').read_bytes()).hexdigest(),*['']*8])
    for name,obj in [('proposed_benchmark_v2.json',proposed),('proposed_gold_v2.json',pg)]:
        (ROOT/'review'/name).write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding='utf8')
    # First-pass reviewers do not receive the proposed answers. The gold-bearing
    # external_review_sheet.csv belongs only to the second/adjudication stage.
    with (ROOT/'review/blind_review_sheet.csv').open('w',newline='',encoding='utf8') as f:
        w=csv.DictWriter(f,fieldnames=['id','category','question','scope','dao_id','proposal_id','source_package','reviewer_id','derived_answer',
            'exact_evidence','answerability','ambiguity','duplicate_of','prompt_leak','accept_revise_reject','rationale'])
        w.writeheader()
        for x in proposed:w.writerow({'id':x['id'],'category':x['category'],'question':x['question'],'scope':x['scope_label'],'dao_id':x['dao'],'proposal_id':x['proposal'],
            'source_package':'evidence/snapshot.json and original PDFs under ../datasets/source_documents/'})
    print('Prepared unreleased 200-item replacement draft and answer-blinded external review sheet.')

if __name__=='__main__':main()
