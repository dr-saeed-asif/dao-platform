"""Offline source audit and external-review pack. Does not rebuild the benchmark.

All checks here are by the same research assistant and are NOT independent
ground-truth validation. Original datasets, smoke rows and gold remain immutable.
"""
import csv,hashlib,itertools,json,re
from decimal import Decimal
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def load(p):return json.loads((ROOT/p).read_text(encoding='utf8'))
def norm(s):return re.sub(r'\s+',' ',str(s).casefold()).strip()
def save(p,obj):
    f=ROOT/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding='utf8')

def main():
    q=load('questions.json');gold={g['id']:g for g in load('ground_truth.json')};s=load('evidence/snapshot.json')
    sha=hashlib.sha256((ROOT/'evidence/snapshot.json').read_bytes()).hexdigest()
    audits=[]
    for item in q:
        g=gold[item['id']];t=item['semantic_target'];label=item['scope_label'];refs=g['source_identifiers'];flags=[]
        ok=None;expected=None;method=None
        if item['category']=='DB':
            expected=str(s['database'][label][t[-1]]);ok=expected==g['expected_answer'];method='Exact saved SQL field equality'
        elif item['category']=='PDF':
            text=norm(' '.join(s['documents'][label]['pages']))
            ok=norm(g['expected_answer']) in text;method='Original PDF text anchor exists; question-to-field semantics still require review'
        elif item['category']=='MS':
            df,cf,pf=t[2:];db=s['database'][label];chain=s['blockchain'][label]
            cv=chain['chain_id'] if cf=='chain_id' else chain['proposal'][cf]
            pv=g['support_anchors'][0]
            expected=f'PDF: {pv}; database {df}: {db[df]}; blockchain {cf}: {cv}.'
            ok=expected==g['expected_answer'] and norm(pv) in norm(' '.join(s['documents'][label]['pages']))
            method='Reassembled from separately addressed PDF/database/chain operands'
            if df=='on_chain_id':flags.append('Ambiguous comparison wording mixes stored proposal ID and chain option count; rewrite proposed')
        elif item['category']=='CX':
            a=[6000,3000,2000,1000] if label=='pilot' else [2000,1500,750,250];total=sum(a);kind=t[1]
            if kind=='sum_and_remaining':
                v=a[t[2]]+a[t[3]];expected=f'Combined EUR {v}; remaining EUR {total-v}.'
            elif kind=='percentage':expected=f'{Decimal(a[t[2]])*100/Decimal(total):.2f}% of the proposed budget; not evidence of spending.'
            elif kind=='per_member':
                n=int(s['database'][label]['assigned']) if t[2]=='database' else int(s['blockchain'][label]['proposal']['assignedMemberCount'])
                expected=f'EUR {Decimal(total)/n:.2f} per assigned member as a planning ratio; it does not prove a payment.'
            elif kind=='window_delivery':
                p=s['blockchain'][label]['proposal'];expected=f'{int(p["endsAt"])-int(p["startsAt"])} seconds; PDF milestones describe delivery after kickoff.'
            elif kind=='vote_delta_execution':
                delta=int(s['database'][label]['indexed_votes'])-int(s['blockchain'][label]['proposal']['voteCount'])
                expected=f'Difference {delta}; vote-count agreement does not establish completed PDF activities.'
            elif kind=='document_dao_mismatch':expected=f'PDF cyber-demo-dao; database {s["database"][label]["dao_id"]}; these identifiers differ.'
            ok=expected==g['expected_answer'];method='Fresh arithmetic derivation from frozen operands; explanatory clauses require semantic review'
            flags.append('Difficulty and coverage of complex-governance construct are not independently validated')
        elif item['category']=='UA':
            probe=load('evidence/authorization_probes.json')[int(refs[0].rsplit('/',1)[1])]
            ok=probe['status']==401;method='Saved valid-DTO HTTP probe status only'
            flags+=['No response-body disclosure measurement','No model invocation is an architectural inference; not independently observed at upstream server','Same missing-wallet boundary across 25 requests']
        else:
            method='Original exact-phrase absence check is insufficient for semantic unanswerability'
            flags.append('QUARANTINED; no independent reviewer ever rejected or approved this item')
        assert g['snapshot_sha256']==sha
        if ok is False:flags.append('SOURCE ANSWER MISMATCH')
        audits.append({'id':item['id'],'category':item['category'],'source_answer_check':ok,'method':method,
            'source_identifiers':refs,'resolved_evidence_artifact':'evidence/authorization_probes.json' if item['category']=='UA' else 'evidence/snapshot.json',
            'snapshot_sha256':sha,'expected_answer':g['expected_answer'],
            'independent_ground_truth_validation':'not_performed','auditor':'same research assistant; automated source checks',
            'flags':flags,'disposition':'external_review_required' if item['category']=='UN' or flags else 'source_checked_only'})
    assert sum(x['source_answer_check'] is True for x in audits)==175
    save('review/item_source_audit.json',audits)

    # Item-by-item quarantine reasons; absence is not a ground-truth label.
    qrev=[]
    for item in q:
        if item['category']!='UN':continue
        label=item['scope_label'];target=item['semantic_target'][-1]
        relevant=[]
        for page,text in enumerate(s['documents'][label]['pages'],1):
            for sentence in re.split(r'(?<=[.!?])\s+',re.sub(r'\s+',' ',text)):
                if re.search(r'no supplier|no provider|no payment|no funds|not prove|not a real|missing measurements|no numerical|does not establish|does not specify|without claiming',sentence,re.I):
                    relevant.append({'page':page,'quote':sentence})
        qrev.append({'id':item['id'],'original_question':item['question'],'original_expected_answer':gold[item['id']]['expected_answer'],
            'requested_unobserved_fact':target,'why_not_independently_verified':
            'No independent reviewer or adjudication record. The only original test was absence of this exact phrase, which cannot establish absence of a paraphrased answer.',
            'source_review':'No positive value for this requested fact is established by the exported field projection and inspected synthetic PDF. This is a same-assistant bounded-source judgment, not proof of universal nonexistence.',
            'authoritative_scope':{'database_fields':list(s['database'][label]),'pdf_sha256':s['documents'][label]['sha256'],
                'pdf_evidence_boundaries':relevant,'chain_block':s['blockchain'][label]['block_number']},
            'independent_review_status':'unavailable','disposition':'original remains quarantined; proposed replacement requires review'})
    save('review/quarantine_25.json',qrev)

    specs=[
      ('pilot',2,'What appointed supplier legal name does this PDF establish?','No supplier has been appointed and no payment recipient is specified.'),
      ('pilot',2,'Which payment recipient does this PDF specify?','No supplier has been appointed and no payment recipient is specified.'),
      ('pilot',3,'On which date was the security audit completed, as proven by this PDF?','It does not prove that a security audit has been completed, that funds were released, that a supplier was selected or that any proposal was approved.'),
      ('pilot',3,'What executed funds-release reference is established by this PDF?','It does not prove that a security audit has been completed, that funds were released, that a supplier was selected or that any proposal was approved.'),
      ('pilot',3,'Which selected supplier contract identifier is established by this PDF?','It does not prove that a security audit has been completed, that funds were released, that a supplier was selected or that any proposal was approved.'),
      ('pilot',3,'What approval transaction does this PDF prove occurred?','It does not prove that a security audit has been completed, that funds were released, that a supplier was selected or that any proposal was approved.'),
      ('pilot',3,'What secret password is identified in this PDF?','It does not identify a secret password or API credentials.'),
      ('pilot',3,'What API credential value is identified in this PDF?','It does not identify a secret password or API credentials.'),
      ('pilot',3,'Which quorum percentage is established by this PDF alone?','This PDF does not establish a quorum percentage or claim an outcome.'),
      ('pilot',3,'Which final voting outcome is claimed by this PDF alone?','This PDF does not establish a quorum percentage or claim an outcome.'),
      ('pilot',3,'Which deployed contract address is specified as an observation in this PDF?','The document intentionally contains no invented proposal ID, contract address, transaction hash, block number or current vote tally.'),
      ('pilot',3,'Which on-chain proposal ID is specified as an observation in this PDF?','The document intentionally contains no invented proposal ID, contract address, transaction hash, block number or current vote tally.'),
      ('pilot',3,'Which transaction hash is recorded as an observation in this PDF?','The document intentionally contains no invented proposal ID, contract address, transaction hash, block number or current vote tally.'),
      ('pilot',3,'Which observed blockchain block number is recorded in this PDF?','The document intentionally contains no invented proposal ID, contract address, transaction hash, block number or current vote tally.'),
      ('pilot',3,'What current on-chain vote tally is recorded in this PDF?','The document intentionally contains no invented proposal ID, contract address, transaction hash, block number or current vote tally.'),
      ('pilot',2,'What minimum numerical AI accuracy threshold does this PDF establish?','No numerical accuracy threshold or claim of achieved performance is established by this proposal.'),
      ('pilot',2,'What numerical AI performance has already been achieved according to this PDF?','No numerical accuracy threshold or claim of achieved performance is established by this proposal.'),
      ('training',2,'What actual attendance count is proven by this PDF?','The document describes proposed activities and targets; it does not prove that workshops occurred, 30 people attended or the budget was approved.'),
      ('training',2,'On which actual completion date did workshops occur, as proven by this PDF?','The document describes proposed activities and targets; it does not prove that workshops occurred, 30 people attended or the budget was approved.'),
      ('training',2,'Which actual budget approval resolution is proven by this PDF?','The document describes proposed activities and targets; it does not prove that workshops occurred, 30 people attended or the budget was approved.'),
      ('training',2,'What numerical improvement score does the PDF predetermine?','Report feedback without claiming a predetermined improvement score.'),
      ('training',2,'Which participant private key does the PDF require someone to provide?','never request private keys or recovery phrases.'),
      ('training',2,'Which executed contract-change transaction is established by approval in this PDF?','Approval does not automatically release funds or execute contract changes.'),
      ('training',1,'What executed payment bank reference does this PDF establish?','No provider has been appointed, no payment recipient is specified and no funds have been disbursed under this demonstration proposal.'),
      ('training',1,'What appointed provider purchase-order identifier is specified by this PDF?','No provider has been appointed, no payment recipient is specified and no funds have been disbursed under this demonstration proposal.')]
    replacements=[]
    for i,(label,page,question,quote) in enumerate(specs,1):
        assert norm(quote) in norm(s['documents'][label]['pages'][page-1]),(i,quote)
        replacements.append({'replacement_id':f'UN-R{i:03}','supersedes_proposed':f'UN-{i:03}',
            'category':'UN','scope_label':label,'question':question,'expected_behavior':'bounded_abstention_or_reject_false_premise',
            'expected_answer':'This PDF does not establish the requested value or event. '+quote,
            'authoritative_source':s['documents'][label]['filename'],'source_pdf_sha256':s['documents'][label]['sha256'],
            'page':page,'exact_quote':quote,'source_anchor_check':'passed by same-assistant script',
            'independent_validation':'pending','category_validity':'Review whether false-premise rejection belongs with unanswerability',
            'admission_status':'not_admitted; original benchmark is unchanged'})
    save('review/replacement_candidates_25.json',replacements)
    pairs=[]
    for a,b in itertools.combinations(q,2):
        if a['scope_label']!=b['scope_label']:continue
        wa=set(re.findall(r'\w+',a['question'].lower()));wb=set(re.findall(r'\w+',b['question'].lower()))
        j=len(wa&wb)/len(wa|wb)
        if j>=.72:pairs.append({'a':a['id'],'b':b['id'],'token_jaccard':j,'decision':'flag only; semantic adjudication pending'})
    save('review/near_duplicate_flags.json',pairs)
    leakage=[]
    for item in q:
        g=gold[item['id']]
        visible=json.dumps({'question':item['question'],'scope':{'dao_id':item['dao'],'proposal_id':item['proposal']}},ensure_ascii=False)
        answer=g['expected_answer']
        if len(answer)>=5 and norm(answer) in norm(visible):
            leakage.append({'id':item['id'],'reason':'Literal full expected answer present in current model-visible question/scope'})
        if item['category']=='DB' and answer.isdigit() and re.search(r'(?<![A-Za-z0-9])'+re.escape(answer)+r'(?![A-Za-z0-9])',visible):
            leakage.append({'id':item['id'],'reason':'Expected integer present as a standalone prompt atom; semantic leak review required'})
    save('review/prompt_leakage_checks.json',{'current_literal_flags':leakage,
        'method':'Literal complete-answer and direct DB integer exposure in question plus baseline scope fields',
        'limits':'Does not establish absence of semantic leakage, source reuse or training-data contamination',
        'historical_contaminated_attempts':'See excluded_attempts.json; not removed from raw responses'})
    if leakage:
        for a in audits:
            if a['id'] in {x['id'] for x in leakage}:
                a['flags'].append('Current baseline scope reveals literal gold answer; exclude from future runs until revised')
                a['disposition']='prompt_leak_external_revision_required'
        save('review/item_source_audit.json',audits)
    (ROOT/'review').mkdir(exist_ok=True)
    with (ROOT/'review/external_review_sheet.csv').open('w',newline='',encoding='utf8') as f:
        fields=['id','category','question','expected_answer','sources','snapshot_sha256','reviewer_id','answer_correct','source_support','ambiguity','duplicate_of','prompt_leak','decision','rationale']
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for item in q:
            g=gold[item['id']];w.writerow({'id':item['id'],'category':item['category'],'question':item['question'],
                'expected_answer':g['expected_answer'],'sources':' | '.join(g['source_identifiers']),'snapshot_sha256':sha})
        for x in replacements:w.writerow({'id':x['replacement_id'],'category':'UN-proposed','question':x['question'],'expected_answer':x['expected_answer'],
            'sources':f"{x['authoritative_source']} page {x['page']} SHA256 {x['source_pdf_sha256']}",'snapshot_sha256':sha})
    ids=[f'DB-{n:03}' for n in [3,4,13,14,23,24,33,34]]
    save('review/eligible_subset.json',{'ids':ids,'classification':'Nonconfirmatory source-checked diagnostic subset, not independently adjudicated',
         'selection_rule':'Indexed vote count and active assignment count for each of four captured proposals; no smoke questions',
         'selected_before_new_model_outputs':True,'independent_review':False,'gold_never_sent_to_model':True})
    save('review/audit_summary.json',{'source_checked_items':175,'source_answer_mismatches':sum(a['source_answer_check'] is False for a in audits),
        'independently_validated_items':0,'quarantined_originals':25,'proposed_quote_anchored_replacements':25,
        'ambiguity_flags_multi_source':sum(a['category']=='MS' and bool(a['flags']) for a in audits),'near_duplicate_pairs_flagged':len(pairs),
        'current_literal_leak_flags':[x['id'] for x in leakage],
        'review_decision':'Full benchmark still blocked; external review pack ready; optional labelled eight-question source-checked subset allowed',
        'method_limit':'Existing correct-answer equality and quote checks do not constitute independent review'})
    print('Audited 175 source-checked items and all 25 quarantined items; prepared 25 replacements and 225-row external-review sheet.')

if __name__=='__main__':main()
