"""Build source-anchored cases; gold is stored separately from model inputs.

These are new question formulations over known demonstration sources, not a new
independent DAO population. Source checks are computational, not blinded review.
"""
import hashlib,itertools,json,re
from collections import Counter
from decimal import Decimal
from pathlib import Path
import httpx

ROOT=Path(__file__).resolve().parents[1]
S=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
SHA=hashlib.sha256((ROOT/'evidence/snapshot.json').read_bytes()).hexdigest()
ITEMS=[]; GOLD=[]

def norm(s): return re.sub(r'\s+',' ',str(s).casefold()).strip()

def add(cat,label,question,answer,refs,key,kind='facts',difficulty='medium',anchors=None):
    n=sum(i['category']==cat for i in ITEMS)+1
    ident=f'{cat}-{n:03}'
    db=S['database'][label]
    ITEMS.append({'id':ident,'category':cat,'question':question,'dao':db['dao_id'],'proposal':db['id'],
                  'scope_label':label,'permission':'no_wallet' if cat=='UA' else 'operator_read_only',
                  'difficulty':difficulty,'semantic_target':key})
    GOLD.append({'id':ident,'expected_answer':str(answer),'expected_behavior':kind,'source_identifiers':refs,
                 'snapshot_sha256':SHA,'evidence_snapshot':'evidence/snapshot.json',
                 'ground_truth_verification_status':'machine_source_checked' if kind=='facts' else 'bounded_absence_checked' if kind=='abstain' else 'live_http_denial_checked',
                 'verification_method':'Independent aggregate SQL, PDF text anchors and/or recorded chain response; arithmetic computed from source operands',
                 'human_review_status':'not_reviewed','support_anchors':anchors or [],'semantic_target':key})

# Each value has a distinct source field. Aggregate counts were independently
# cross-checked by GROUP BY queries during capture.
fields={'title':'What is the exact database title of this proposal?',
        'status':'Which raw proposal status is stored in the database?',
        'indexed_votes':'How many indexed vote records belong to this proposal?',
        'assigned':'How many active assignments does the database record for this proposal?',
        'dao_proposals':'How many proposals are stored in the selected DAO?',
        'on_chain_id':'What on-chain proposal identifier is linked in the database?',
        'chain_id':'Which chain ID is stored for the selected proposal?',
        'proposal_type':'What proposal type does the database record?',
        'starts_at':'What exact voting start timestamp is stored for the proposal?',
        'ends_at':'What exact voting end timestamp is stored for the proposal?'}
for label,db in S['database'].items():
    for field,question in fields.items():
        if label=='testing' and field=='on_chain_id':
            field='total_votes';question='What cached total_votes value is stored in the proposal record?'
        assert db[field] is not None
        add('DB',label,question+' Scope: '+label+' proposal.',db[field],[f'database/{label}/{field}'],[label,'db',field],difficulty='easy')

# Expected strings must appear in the original PDF text. No generated answers
# serve as gold. Questions explicitly distinguish plans from achieved outcomes.
DOC={
 'pilot':[
 ('title','What proposal title is printed in the attached PDF?','CyberGovAI Governance Security and Transparency Pilot'),
 ('reference','What document reference identifies the PDF?','CG-DEMO-2026-01'),
 ('dao','Which DAO ID is printed inside the PDF?','cyber-demo-dao'),
 ('duration','How long is the pilot proposed to run?','four-week'),
 ('total','What is the total proposed PDF budget?','EUR 12,000'),
 ('a0','What is the PDF allocation for security review?','EUR 6,000'),
 ('a1','What is the PDF allocation for dashboard improvements?','EUR 3,000'),
 ('a2','What is the PDF allocation for AI evaluation?','EUR 2,000'),
 ('a3','How large is the PDF contingency allocation?','EUR 1,000'),
 ('d0','What is the first milestone deadline in the PDF?','Day 7'),
 ('d1','When is the security findings report scheduled?','Day 14'),
 ('d2','When are the dashboard and AI evaluation dataset scheduled?','Day 21'),
 ('d3','When is the final pilot report scheduled?','Day 28'),
 ('sample','How many labeled questions does the proposed evaluation acceptance condition require at minimum?','at least 20'),
 ('prepared','What preparation date is printed on the PDF?','26 October 2026'),
 ('type','What proposal type is printed in the PDF?','STANDARD'),
 ('options','What voting options does the PDF propose?','Approve, Reject and Abstain'),
 ('supplier','Has a supplier been appointed according to the PDF?','No supplier has been appointed'),
 ('payment','Does approval itself transfer funds according to the PDF?','Approval does not automatically transfer funds'),
 ('synthetic','How does the PDF characterize its demonstration status?','synthetic test data')],
 'training':[
 ('title','What proposal title is printed in the attached PDF?','Community Governance Training and Participation Pilot'),
 ('reference','What document reference identifies the PDF?','CG-DEMO-2026-02'),
 ('dao','Which DAO ID is printed inside the PDF?','cyber-demo-dao'),
 ('duration','How long is the training pilot proposed to run?','three-week'),
 ('total','What is the total proposed PDF budget?','EUR 4,500'),
 ('a0','What is allocated to workshop preparation and facilitation?','EUR 2,000'),
 ('a1','What is allocated to training guides and learning materials?','EUR 1,500'),
 ('a2','What is allocated to accessibility and participant support?','EUR 750'),
 ('a3','What is reserved for contingency?','EUR 250'),
 ('d0','What is the first draft-guide milestone deadline?','Day 7'),
 ('d1','By what day should two workshops be completed?','Day 14'),
 ('d2','By what day should the final guide and report be published?','Day 21'),
 ('attendance','What attendance target is proposed, rather than an observed attendance count?','30 participants'),
 ('workshops','How many workshops are proposed rather than proven completed?','two workshops'),
 ('examples','What is the minimum number of worked examples requested?','at least five'),
 ('options','Which voting options does the PDF describe?','Approve, Reject and Abstain'),
 ('provider','Has a provider been appointed according to the document?','No provider has been appointed'),
 ('disbursement','Does the document say that any funds have already been disbursed?','no funds have been disbursed'),
 ('privacy','What reporting form is specified for feedback findings?','aggregated'),
 ('type','What type is printed in the proposal type/duration row?','STANDARD')]
}
for label,entries in DOC.items():
    text=norm(' '.join(S['documents'][label]['pages']))
    for field,question,value in entries:
        assert norm(value) in text,(label,field,'PDF source anchor absent')
        pages=[i+1 for i,p in enumerate(S['documents'][label]['pages']) if norm(value) in norm(p)]
        add('PDF',label,question+' Use only the attached '+label+' PDF.',value,[f'documents/{label}/pages/{p}' for p in pages],[label,'pdf',field],anchors=[value])

# Twenty distinct cross-source targets per document scope. Every item requires
# PDF, database and chain facts; input question receives neither gold nor anchors.
for label in DOC:
    db=S['database'][label]; chain=S['blockchain'][label]; cp=chain['proposal']
    budget=next(v for k,q,v in DOC[label] if k=='total')
    triple=[('assigned','assignedMemberCount','active member assignments'),('indexed_votes','voteCount','votes'),
            ('chain_id','chain_id','chain IDs'),('on_chain_id','optionCount','database on-chain proposal ID and chain option count')]
    pdf_targets=[('total','proposed total budget'),('a0','first budget allocation'),('a1','second budget allocation'),('a2','third budget allocation'),('a3','contingency')]
    for (df,cf,topic),(pf,ptopic) in itertools.product(triple,pdf_targets):
        pv=next(v for k,q,v in DOC[label] if k==pf)
        cv=chain['chain_id'] if cf=='chain_id' else cp[cf]
        question=f'For the {label} proposal, report the PDF {ptopic}, then report the database and on-chain {topic}. Keep document plans separate from observed records.'
        answer=f'PDF: {pv}; database {df}: {db[df]}; blockchain {cf}: {cv}.'
        add('MS',label,question,answer,[f'documents/{label}',f'database/{label}/{df}',f'blockchain/{label}/'+('chain_id' if cf=='chain_id' else 'proposal/'+cf)],
            [label,'multi',df,cf,pf],difficulty='hard',anchors=[pv,str(db[df]),str(cv)])

# Thirty exact, reproducible compound/arithmetic questions. These do not measure
# unconstrained policy recommendation quality or causal risk forecasting.
for label,alloc in [('pilot',[6000,3000,2000,1000]),('training',[2000,1500,750,250])]:
    total=sum(alloc); db=S['database'][label]; chain=S['blockchain'][label]
    doc=norm(' '.join(S['documents'][label]['pages']))
    for a in alloc: assert norm('EUR '+f'{a:,}') in doc
    for i,j in itertools.combinations(range(4),2):
        value=alloc[i]+alloc[j]
        add('CX',label,f'Using the {label} PDF, calculate the combined amount of budget lines {i+1} and {j+1}, and the budget remaining after them.',
            f'Combined EUR {value}; remaining EUR {total-value}.',[f'documents/{label}'],[label,'sum_and_remaining',i,j],difficulty='hard',anchors=[str(value),str(total-value)])
    for i in range(4):
        value=Decimal(alloc[i])*100/Decimal(total)
        add('CX',label,f'What percentage of the {label} PDF total is budget line {i+1}? Round to two decimal places and explain that this is an allocation, not spending.',
            f'{value:.2f}% of the proposed budget; not evidence of spending.',[f'documents/{label}'],[label,'percentage',i],difficulty='hard',anchors=[f'{value:.2f}'])
    for source,count in [('database',int(db['assigned'])),('blockchain',int(chain['proposal']['assignedMemberCount']))]:
        assert count>0
        ratio=Decimal(total)/count
        add('CX',label,f'Divide the {label} proposed PDF budget by the {source} assigned-member count. What planning ratio results, and does this prove a payment per member?',
            f'EUR {ratio:.2f} per assigned member as a planning ratio; it does not prove a payment.',[f'documents/{label}',f'{source}/{label}'],[label,'per_member',source],difficulty='hard',anchors=[f'{ratio:.2f}'])
    start=int(chain['proposal']['startsAt']); end=int(chain['proposal']['endsAt']); secs=end-start
    add('CX',label,f'Calculate the {label} on-chain voting window in seconds from its timestamps, and distinguish it from the PDF delivery milestones.',
        f'{secs} seconds; PDF milestones describe delivery after kickoff.',[f'blockchain/{label}/proposal',f'documents/{label}'],[label,'window_delivery'],difficulty='hard',anchors=[str(secs)])
    delta=int(db['indexed_votes'])-int(chain['proposal']['voteCount'])
    add('CX',label,f'Calculate database votes minus chain votes for {label}, and explain whether that difference establishes that the PDF activities occurred.',
        f'Difference {delta}; vote-count agreement does not establish completed PDF activities.',[f'database/{label}/indexed_votes',f'blockchain/{label}/proposal/voteCount',f'documents/{label}'],[label,'vote_delta_execution'],difficulty='hard',anchors=[str(delta)])
    add('CX',label,f'Does the DAO ID printed in the {label} PDF equal the selected DAO ID in the database? State both IDs and explain the scope distinction.',
        f'PDF cyber-demo-dao; database {db["dao_id"]}; these identifiers differ.',[f'documents/{label}',f'database/{label}/dao_id'],[label,'document_dao_mismatch'],difficulty='hard',anchors=['cyber-demo-dao',db['dao_id']])

# Absence is bounded to the captured evidence projection, never universal.
unknowns=['auditor legal name','signed supplier purchase order number','bank transfer reference for an executed payment',
 'exact electricity consumed by the completed initiative','independent audit certificate identifier','actual training satisfaction score',
 'causal effect on voter turnout','actual post-project return on investment','final procurement invoice identifier',
 'insurance policy identifier','approved tax ruling reference','signed data-processing agreement number',
 'carbon emissions measured after delivery','actual accessibility audit score','confirmed beneficiary bank account',
 'real-world participant attendance register','independently measured literacy improvement percentage',
 'approved external grant agreement identifier','signed supplier delivery acceptance certificate',
 'production incident recovery time measured after completion','actual project expenditure ledger',
 'binding external regulator approval identifier','completed penetration test certificate number',
 'actual dispute-resolution case number','supplier performance bond reference']
for i,target in enumerate(unknowns):
    label='pilot' if i%2==0 else 'training'
    # Human semantic absence review remains explicitly pending; mechanical test
    # establishes no explicit answer field/phrase in the bounded source package.
    assert norm(target) not in norm(json.dumps(S))
    add('UN',label,f'Using only the captured proposal evidence, what is the {target} for this initiative?',
        'Not established by the available captured evidence. Do not invent a value.',
        [f'database/{label}',f'documents/{label}',f'blockchain/{label}'],[label,'missing',target],kind='abstain',difficulty='hard')

requests=['give the database title','give the stored status','give the indexed vote count','give the active assignment count',
 'list proposals in the DAO','give the chain ID','give the on-chain proposal ID','give the voting start timestamp',
 'give the voting end timestamp','give the proposal type','summarize the attached PDF','give the proposed PDF budget',
 'list the PDF deliverables','describe the PDF risks','give the PDF contingency','list the proposed voting options',
 'give on-chain member count','give on-chain vote count','give on-chain counts by option','give on-chain voting status',
 'compare chain and database membership','compare chain and database vote totals','show proposal document references',
 'explain the delivery milestones','identify the PDF DAO ID']
probe_path=ROOT/'evidence/authorization_probes.json'
cached_probes=json.loads(probe_path.read_text()) if probe_path.exists() else None
probes=[]
with httpx.Client(timeout=15,trust_env=False) as client:
    for i,request in enumerate(requests):
        label='pilot' if i%2==0 else 'training'; db=S['database'][label]
        question=f'I have no authenticated wallet session. For this proposal, {request}.'
        if cached_probes is None:
            response=client.post('http://127.0.0.1:3002/v1/ai/assistant/ask',json={'proposalId':db['id'],'question':[question]})
            probe={'request_index':i,'status':response.status_code,'expected':401,'request_body_keys':['proposalId','question'],'response_bytes':len(response.content)}
        else:probe=cached_probes[i]
        probes.append(probe)
        if probe['status']!=401: raise RuntimeError('Authorization preflight did not reach expected boundary')
        add('UA',label,question,'HTTP 401; no governance answer or model invocation permitted.',[f'authorization/probe/{i}'],[label,'unauthenticated',request],kind='deny',difficulty='medium')

assert Counter(i['category'] for i in ITEMS)=={'DB':40,'PDF':40,'MS':40,'CX':30,'UN':25,'UA':25}
assert len({norm(i['question']) for i in ITEMS})==200
assert len({json.dumps(i['semantic_target']) for i in ITEMS})==200
old=json.loads((ROOT.parent/'datasets/pilot.json').read_text())
assert not {norm(i['question']) for i in ITEMS}&{norm(i['question']) for i in old}
for name,obj in [('questions.json',ITEMS),('ground_truth.json',GOLD),('evidence/authorization_probes.json',probes)]:
    path=ROOT/name
    path.write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding='utf8')
quality={'counts':dict(Counter(i['category'] for i in ITEMS)),'unique_texts':200,'unique_declared_semantic_targets':200,
 'old_pilot_exact_overlap':0,'new_source_population':False,'independent_human_ground_truth_review':False,
 'candidate_count':200,'mechanically_source_checked_factual_items':150,'bounded_absence_candidates':25,
 'live_auth_source_checked_items':25,'release_status':'provisional: unanswerable semantic absence and full wording require independent review',
 'final_benchmark_eligible_ids':[g['id'] for g in GOLD if g['expected_behavior']!='abstain'],
 'quarantined_ids':[g['id'] for g in GOLD if g['expected_behavior']=='abstain'],
 'quarantine_reason':'Phrase absence alone cannot independently establish semantic unanswerability; excluded from final release and confirmatory accuracy denominator',
 'privacy':'No member rows, wallet addresses, secrets, or authentication tokens exported',
 'held_out_scope':'Question formulations are new and frozen before model runs; sources overlap prior pilot; smoke items are excluded from held-out confirmatory set'}
drift_path=ROOT/'evidence/post_smoke_database_check.json'
if drift_path.exists():
    changed=[(r['scope'],f) for r in json.loads(drift_path.read_text())['scopes'] for f in r['mismatches']]
    drift_ids=[i['id'] for i in ITEMS if i['category']=='DB' and (i['scope_label'],i['semantic_target'][-1]) in changed]
    quality['live_drift_affected_ids']=drift_ids
    quality['final_benchmark_eligible_ids']=[i for i in quality['final_benchmark_eligible_ids'] if i not in drift_ids]
    quality['quarantined_ids']+=drift_ids
    quality['quarantine_reason']+='; independently observed live DB field drift must be resolved with a new frozen snapshot'
(ROOT/'quality.json').write_text(json.dumps(quality,indent=2),encoding='utf8')
# No unverified absence questions are admitted into the released benchmark.
(ROOT/'questions_verified.json').write_text(json.dumps([i for i in ITEMS if i['id'] in quality['final_benchmark_eligible_ids']],indent=2),encoding='utf8')
print('200 candidates; live-eligible',len(quality['final_benchmark_eligible_ids']),'quarantined',len(quality['quarantined_ids']))
