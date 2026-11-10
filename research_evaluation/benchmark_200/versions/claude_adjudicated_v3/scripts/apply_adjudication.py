"""Apply the supplied Claude audit to a separate version; never edit old data."""
import csv,hashlib,json
from collections import Counter
from datetime import datetime
from pathlib import Path
V=Path(__file__).resolve().parents[1];ROOT=V.parents[1]

def read(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,obj):(V/p).write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding='utf8')

def main():
    ap=ROOT/'review/independent_audit/independent_adjudication.json';audit=read(ap)
    original={q['id']:q for q in read(ROOT/'questions.json')};draft={q['id']:q for q in read(ROOT/'review/proposed_benchmark_v2.json')}
    qs=original|draft;gs={g['id']:g for g in read(ROOT/'ground_truth.json')}|{g['id']:g for g in read(ROOT/'review/proposed_gold_v2.json')}
    snapshot=read(ROOT/'evidence/snapshot.json');rechecks={x['id']:x for x in read(V/'evidence/snapshot_only_21_recheck.json')}
    byid={x['id']:x for x in audit};assert len(byid)==len(audit)==226
    accepted=[];gold=[];registry=[];exposed=[];revisions=[]
    for item in audit:
        ident=item['id'];r={**item,'provided_audit_sha256':sha(ap),'reviewer_type':'user-provided independent Claude LLM audit',
                            'human_validation_status':'not_human_validated'}
        if item['verification_gap'] and item['decision']=='ACCEPT':r['new_authoritative_source_recheck']=rechecks[ident]
        registry.append(r)
        if item['decision']=='ACCEPT':
            if item['verification_gap'] and not rechecks[ident]['source_recheck_passed']:continue
            q=qs[ident]
            safe={k:q[k] for k in ['id','category','question','dao','proposal','scope_label','permission','difficulty'] if k in q}
            safe.update(review_status='Claude_LLM_ACCEPT',human_validation_status='not_human_validated',
                exposed_to_systems=bool(item['exposed_to_systems']),version='claude_adjudicated_v3')
            assert gs[ident]['expected_answer']==item['expected_answer'],ident
            g={**gs[ident],'evidence_snapshot':'../../evidence/snapshot.json',
               'admission_status':'Claude_LLM_ACCEPT; not human validated',
               'independent_ground_truth_validation':'User-provided Claude LLM audit; no independent human review',
               'human_review_status':'not_human_validated','reviewer_decision':'ACCEPT','reviewer_type':'independent LLM; not human',
               'human_validation_status':'not_human_validated','reviewer_evidence_refs':item['evidence_refs'],
               'reviewer_scoring_note':item['scoring_note'],'adjudication_source_sha256':sha(ap)}
            if ident in rechecks:g['new_source_recheck_ref']='evidence/snapshot_only_21_recheck.json#'+ident
            accepted.append(safe);gold.append(g)
            if item['exposed_to_systems']:exposed.append({'id':ident,'reason':'Claude exposure ledger; development/older pilot use','confirmatory_eligible':False})
        elif item['decision']=='REVISE':
            q=qs[ident];g=gs.get(ident,{});label=q['scope_label'];rid=ident+'.r1'
            rev={'parent_id':ident,'proposed_id':rid,'original_question':item['question'],'reviewer_feedback':item['issues'],
                 'expected_answer':item['expected_answer'],'human_adjudication':'pending','new_peer_review':'pending',
                 'admitted':False,'exposed_parent':item['exposed_to_systems'],'source_refs':item['evidence_refs']}
            if ident=='DB-021':
                rev.update(proposed_id='DB-R021',revised_question=qs['DB-R021']['question'],expected_answer=byid['DB-R021']['expected_answer'],
                    disposition='Superseded by separately Claude-accepted DB-R021; original title question removed',
                    new_peer_review='already ACCEPT for exact DB-R021 replacement',human_adjudication='not_human_validated; no new semantic decision asserted')
            elif ident=='DB-031':
                db=snapshot['database']['testing'];seconds=int((datetime.fromisoformat(db['ends_at'])-datetime.fromisoformat(db['starts_at'])).total_seconds())
                rev.update(revised_question='How long is the selected testing proposal database voting window in seconds?',expected_answer=str(seconds),
                    source_refs=['database/testing/starts_at','database/testing/ends_at'],derivation='ends_at minus starts_at in seconds')
            elif ident=='PDF-039':
                rev.update(revised_question="In the training PDF's risks-and-mitigations table, what publication format mitigates personal information in feedback?",
                    expected_answer='Publish aggregated findings; collect only necessary information.',source_refs=['CyberDAO_Community_Training_Proposal.pdf page 2, Personal information in feedback row'])
            elif ident.startswith('MS-'):
                target=g['semantic_target'][-1];term={'total':'total budget','a0':'first budget allocation','a1':'second budget allocation','a2':'third budget allocation','a3':'contingency allocation'}[target]
                rev.update(revised_question=f'For the {label} proposal, answer separately: (1) What {term} does the attached PDF propose? (2) What on-chain proposal identifier is stored in the database? (3) How many voting options does the contract record at the saved block? Attribute each answer to its source.',
                    scoring_requirements=['PDF amount with document attribution','Stored on-chain ID with database attribution','Option count with pinned-contract attribution'])
            elif ident=='UA-001':
                rev.update(revised_question='For a valid assistant-ask request without a wallet session, what HTTP status and error JSON are returned?',
                    expected_answer='HTTP 401 with an Unauthorized error and wallet-sign-in message. Observed response contains no proposal data. Upstream invocation count remains unmeasured.',
                    cohort='shared_authorization_gateway; not four independent LLM trials',
                    source_refs=['evidence/authorization_reconciliation.json#valid_singular_question_no_wallet'],
                    request_body_schema={'proposalId':'selected proposal ID','question':['Show the selected proposal title.']},
                    confirmatory_eligible=False)
            elif ident=='UN-R010':
                rev.update(revised_question='What voting outcome does this PDF state?',expected_answer='The PDF states no voting outcome. Attribute this absence to the PDF; any separately reported chain outcome must be explicitly identified as a chain observation.',
                    source_refs=['CyberGovAI_Pilot_Proposal.pdf page 3: This PDF does not establish a quorum percentage or claim an outcome.'])
            else:raise RuntimeError('Missing item-specific revision '+ident)
            assert rev.get('revised_question')
            revisions.append(rev)
    assert len(accepted)==155 and len(exposed)==14 and len(revisions)==15
    confirmatory=[x for x in accepted if not x['exposed_to_systems']]
    eligible_ids={x['id'] for x in confirmatory};assert len(eligible_ids)==141
    assert not eligible_ids&{x['id'] for x in exposed}
    assert not any(x['admitted'] for x in revisions)
    write('decision_registry.json',registry)
    write('accepted_questions.json',accepted);write('accepted_gold.json',gold)
    write('confirmatory_questions.json',confirmatory);write('confirmatory_gold.json',[g for g in gold if g['id'] in eligible_ids])
    write('exposed_exclusions.json',exposed);write('revisions_pending.json',revisions)
    write('rejected_registry.json',[x for x in registry if x['decision']=='REJECT'])
    summary={'audited_records':226,'reviewer_type':'independent Claude LLM, not human','reviewer_decisions':dict(Counter(x['decision'] for x in audit)),
        'accepted_pool':len(accepted),'item_specific_revisions_prepared':15,'new_revision_adjudications_pending':14,
        'superseded_by_already_accepted_replacement':1,'rejected':56,
        'accepted_exposed_excluded':14,'all_audit_records_marked_exposed':sum(x['exposed_to_systems'] for x in audit),
        'accepted_snapshot_only_before':21,'snapshot_only_source_rechecked':sum(x['source_recheck_passed'] for x in rechecks.values()),
        'snapshot_only_recheck_failures':sum(not x['source_recheck_passed'] for x in rechecks.values()),
        'historical_sql_at_chain_block_unverified':21,'human_validated_items':0,
        'confirmatory_content_eligible_under_LLM_review_policy':len(confirmatory),
        'confirmatory_eligible_categories':dict(Counter(x['category'] for x in confirmatory)),
        'shortfall_to_200_currently_eligible':200-len(confirmatory),'full_200_execution_ready':False,
        'new_model_experiments':0,'original_benchmark_overwritten':False}
    write('readiness_counts.json',summary)
    with (V/'readiness_counts.csv').open('w',newline='',encoding='utf8') as f:
        w=csv.writer(f);w.writerow(['metric','value'])
        for k,value in summary.items():w.writerow([k,json.dumps(value) if isinstance(value,dict) else value])
    print('Applied audit: accepted 155; 14 exposed excluded; 141 content-eligible; 15 revisions prepared (14 pending / 1 superseded); rejected 56.')

if __name__=='__main__':main()
