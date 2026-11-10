import json,re,subprocess,datetime,csv,collections,hashlib
q={x['id']:x for x in json.load(open('questions.json'))}
g={x['id']:x for x in json.load(open('ground_truth.json'))}
snap=json.load(open('evidence/snapshot.json'))
chain={r['label']:r for r in json.load(open('evidence/independent_chain_check.json'))['results']}
rep=json.load(open('review/replacement_candidates_25.json'))
norm=lambda t:re.sub(r'\s+',' ',t).lower()
def pages(f): return [norm(t) for t in subprocess.run(['pdftotext','-layout','../datasets/source_documents/'+f,'-'],capture_output=True,text=True).stdout.split('\f')[:-1]]
DOC={'pilot':pages('CyberGovAI_Pilot_Proposal.pdf'),'training':pages('CyberDAO_Community_Training_Proposal.pdf')}
HASH={'pilot':hashlib.sha256(open('../datasets/source_documents/CyberGovAI_Pilot_Proposal.pdf','rb').read()).hexdigest(),
      'training':hashlib.sha256(open('../datasets/source_documents/CyberDAO_Community_Training_Proposal.pdf','rb').read()).hexdigest()}
assert HASH['pilot']==snap['documents']['pilot']['sha256'] and HASH['training']==snap['documents']['training']['sha256']
def amounts(d):
    t=DOC[d][1] if d=='pilot' else DOC[d][0]
    seg=t.split('proposed budget',1)[1].split('contingency is reserved')[0]
    return [int(x.replace(',','')) for x in re.findall(r'eur ([\d,]+)',seg)]
AM={d:amounts(d) for d in DOC}
for d in AM: assert sum(AM[d][:-1])==AM[d][-1],(d,AM[d])
ts=lambda t:datetime.datetime.fromtimestamp(int(t),datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00:00')
EXPOSED={'DB-001','MS-001','PDF-005','UA-001','DB-002','DB-003','DB-004','DB-013','DB-014','DB-023','DB-024','DB-033','DB-034'}
PRIOR={'PDF-025','DB-025'}
rows=[]
def add(i,dec,tier,refs,issues,note='',checks=None):
    gi=g.get(i,{})
    rows.append(dict(id=i,category=i.split('-')[0],question=(q.get(i) or {}).get('question'),expected_answer=gi.get('expected_answer'),
      decision=dec,verification_tier=tier,evidence_refs=refs,issues=issues,scoring_note=note,
      exposed_to_systems=i in EXPOSED or i in PRIOR,auditor_checks=checks or []))
def scope(i): return q[i]['scope_label']
for i in [x for x in q if x.startswith('DB-')]:
    L=scope(i); fld=g[i]['source_identifiers'][0].split('/')[-1]; db=snap['database'][L]; ob=chain[L]['observations']
    snapok=str(db[fld])==g[i]['expected_answer']
    chk=[f'gold==snapshot.{fld}: {snapok}']; tier='C_snapshot_only'; refs=[f'evidence/snapshot.json#database.{L}.{fld}']; issues=[]; dec='ACCEPT'; note=''
    if fld in('indexed_votes','total_votes'):
        tier='B_cross_source'; ok=str(ob['voteCount'])==g[i]['expected_answer']; chk.append(f'chain voteCount=={ob["voteCount"]}: {ok}'); refs.append(f'evidence/independent_chain_check.json#{L}.voteCount'); snapok&=ok
    elif fld=='assigned':
        tier='B_cross_source'; ok=str(ob['assignedMemberCount'])==g[i]['expected_answer']; chk.append(f'chain assignedMemberCount=={ob["assignedMemberCount"]}: {ok}'); refs.append(f'evidence/independent_chain_check.json#{L}.assignedMemberCount'); snapok&=ok
    elif fld in('starts_at','ends_at'):
        k='startsAt' if fld=='starts_at' else 'endsAt'; ok=ts(ob[k])==g[i]['expected_answer']; chk.append(f'epoch {ob[k]} -> {ts(ob[k])} (auditor conversion): {ok}'); tier='B_cross_source'; refs.append(f'evidence/independent_chain_check.json#{L}.{k}'); snapok&=ok
        note='Accept ISO-8601/UTC equivalents (e.g. 2026-10-26T08:15:00Z); exact-string match would penalise correct answers.'
    elif fld=='status':
        fin=ob['finalized']; ok=(g[i]['expected_answer']=='FINALIZED')==fin; chk.append(f'chain finalized={fin} coherent: {ok}'); tier='B_cross_source'; refs.append(f'evidence/independent_chain_check.json#{L}.finalized'); snapok&=ok
        note='Raw DB status is indexer-derived; finalizeProposal is permissionless, so live status can drift from the frozen snapshot. Score against the pinned snapshot only.'
    elif fld=='on_chain_id':
        tier='B_cross_source'; chk.append('chain eth_call at this proposal id matches DB start/end/assigned/votes (indirect; the id is the query input)'); refs.append(f'evidence/independent_chain_check.json#{L}')
    elif fld=='proposal_type':
        tier='B_cross_source'; chk.append('chain proposalType=0; domain enum lists Standard first (mapping not independently confirmed)'); refs.append('packages/domain/src/proposal/proposal.types.ts')
    elif fld=='title' and L=='pilot':
        pt=norm(g[i]['expected_answer']) in DOC['pilot'][0]; chk.append(f'title also printed in pilot PDF p1: {pt}'); tier='B_cross_source'; refs.append('CyberGovAI_Pilot_Proposal.pdf p1')
    if fld in('dao_proposals','chain_id','proposal_type'): note+=' Identical gold in all four scopes (guessable); low discrimination.'
    if i=='DB-021': dec='REVISE'; issues.append('Gold title equals the DAO identifier supplied to the baseline as scope context (literal leakage). Replace with DB-R021.')
    if i=='DB-031': dec='REVISE'; issues.append('Near-leak: gold "Cyber Testing" is trivially derivable from scope dao_id "cyber-test". Replace with a field not derivable from scope.')
    if not snapok: dec='REJECT'; issues.append('Gold does not reproduce from evidence')
    add(i,dec,tier,refs,issues,note.strip(),chk)
chk_rows={'PDF-010':r'day 7 inventory','PDF-011':r'day 14 security findings report','PDF-012':r'day 21 dashboard and ai evaluation dataset','PDF-013':r'day 28 final pilot report','PDF-030':r'day 7 publish an accessible draft guide','PDF-031':r'day 14 complete two workshops','PDF-032':r'day 21 publish the final guide'}
for i in [x for x in q if x.startswith('PDF-')]:
    d='pilot' if 'pilot PDF' in q[i]['question'] else 'training'
    pg=[int(s.split('/')[-1]) for s in g[i]['source_identifiers']]
    gold=norm(g[i]['expected_answer']); found=[p for p in pg if gold in DOC[d][p-1]]
    chk=[f'gold string found on page(s) {found} of cited {pg} in auditor pdftotext extraction (sha256 verified)']
    if i in chk_rows:
        m=bool(re.search(chk_rows[i],DOC[d][pg[0]-1])); chk.append(f'table-row check {chk_rows[i]!r}: {m}'); found=found if m else []
    dec,iss,note='ACCEPT',[],''
    if not found: dec='REJECT'; iss.append('gold not found on cited page')
    if i=='PDF-039': dec='REVISE'; iss.append('Ambiguous target: "reporting form for feedback findings" may mean the Day-21 report (attendance, feedback, unresolved issues) or the "publish aggregated findings" privacy mitigation. Name the risk row in the question.')
    if i in('PDF-004','PDF-024'): note='Accept equivalents ("four weeks"/"28 days"; "three weeks"/"21 days").'
    if i in('PDF-018','PDF-019','PDF-037','PDF-038'): note='Yes/no item (50% guess prior); require the cited negation.'
    if i in('PDF-003','PDF-023'): note='PDF-printed DAO ID differs from DB dao_id; "printed inside the PDF" makes the question unambiguous.'
    nm='CyberGovAI_Pilot_Proposal' if d=='pilot' else 'CyberDAO_Community_Training_Proposal'
    add(i,dec,'A_independent',[f'{nm}.pdf p{p}' for p in pg],iss,note,chk)
ordn={'proposed total budget':-1,'first budget allocation':0,'second budget allocation':1,'third budget allocation':2,'contingency':3}
for i in [x for x in q if x.startswith('MS-')]:
    L=scope(i); text=q[i]['question']
    k=[o for o in ordn if o in text][0]; ev=AM[L][ordn[k]] if ordn[k]>=0 else AM[L][-1]
    pdf_ok=f'EUR {ev:,}' in g[i]['expected_answer']; chk=[f'PDF leg ({k}) = EUR {ev:,} recomputed from PDF table: {pdf_ok}']
    if 'assignments' in text: f='assigned'; cv=chain[L]['observations']['assignedMemberCount']; tier='B_cross_source'
    elif 'on-chain votes' in text: f='indexed_votes'; cv=chain[L]['observations']['voteCount']; tier='B_cross_source'
    elif 'chain IDs' in text: f='chain_id'; cv='1212'; tier='C_snapshot_only'
    else: f='on_chain_id'; cv=chain[L]['observations']['optionCount']; tier='B_cross_source'
    dbv=snap['database'][L][f]; both=str(dbv) in g[i]['expected_answer'] and str(cv) in g[i]['expected_answer']
    chk.append(f'DB {f}={dbv}; chain leg={cv}; both present in gold: {both}')
    dec,iss,note='ACCEPT',[],'Score three separate sub-answers; no credit for merged document/observation statements.'
    if f=='on_chain_id': dec='REVISE'; iss.append('Compound wording ("database on-chain proposal ID and chain option count") pairs two unrelated quantities as if compared. Rewrite as two explicit sub-questions.')
    if f=='chain_id': note+=' Chain-ID legs are not covered by the independent eth_call check (backend-reported); needs eth_chainId confirmation.'
    if not (pdf_ok and both): dec='REJECT'; iss.append('gold leg mismatch')
    add(i,dec,tier,[f'PDF budget table ({L})',f'evidence/snapshot.json#database.{L}.{f}','evidence/independent_chain_check.json'],iss,note,chk)
for i in [x for x in q if x.startswith('CX-')]:
    L=scope(i); a=AM[L][:-1]; T=AM[L][-1]; text=q[i]['question']; ans=g[i]['expected_answer']; chk=[]; dec,iss,note,tier='ACCEPT',[],'','A_independent'
    m=re.search(r'lines (\d) and (\d)',text)
    if m:
        x,y=int(m[1])-1,int(m[2])-1; ok=(f'Combined EUR {a[x]+a[y]};' in ans) and (f'remaining EUR {T-a[x]-a[y]}' in ans); chk.append(f'{a[x]}+{a[y]}={a[x]+a[y]}, remaining {T-a[x]-a[y]}: {ok}')
    elif 'percentage' in text:
        n=int(re.search(r'line (\d)',text)[1])-1; p=f'{a[n]/T*100:.2f}%'; ok=ans.startswith(p); chk.append(f'{a[n]}/{T}={p}: {ok}')
        note='Question text states the required caveat ("allocation, not spending"); score the numeric value only.'
        if L=='pilot': note+=' Percentages are printed in the pilot PDF table (extractive).'
    elif 'Divide' in text:
        n=snap['database'][L]['assigned']; ok=f'EUR {T/n:.2f}' in ans; chk.append(f'{T}/{n}={T/n:.2f}: {ok}'); tier='B_cross_source'
        if 'blockchain' in text: dec='REJECT'; iss.append('Operands and answer identical to the database-count sibling (chain count == DB count); cannot discriminate source choice. Duplicate of '+('CX-011' if L=='pilot' else 'CX-026')+'.')
    elif 'voting window' in text:
        ob=chain[L]['observations']; w=int(ob['endsAt'])-int(ob['startsAt']); ok=f'{w} seconds' in ans; chk.append(f'chain endsAt-startsAt={w}: {ok}'); tier='B_cross_source'
        note='Second clause is supported by PDF text that milestones are separate from on-chain voting times.'
    elif 'votes minus chain votes' in text:
        ok=snap['database'][L]['indexed_votes']-int(chain[L]['observations']['voteCount'])==0 and 'Difference 0' in ans; chk.append(f'DB-chain vote difference=0: {ok}'); tier='B_cross_source'
    elif 'DAO ID' in text:
        dbid=snap['database'][L]['dao_id']; ok=('cyber-demo-dao' in DOC[L][0]) and dbid in ans; chk.append(f'PDF dao id cyber-demo-dao on p1; snapshot dao_id={dbid}: {ok}'); tier='C_snapshot_only'
        note='"Explain the scope distinction" is subjective; score the two IDs and the "differ" verdict only.'
    else: ok=False
    if not ok: dec='REJECT'; iss.append('gold not reproduced')
    add(i,dec,tier,['source PDF','evidence/snapshot.json','evidence/independent_chain_check.json'],iss,note,chk)
for i in [x for x in q if x.startswith('UN-')]:
    add(i,'REJECT','A_independent(pdf-only)',['review/quarantine_25.json','source PDFs'],
        ['Auditor read both PDFs in full: none states the requested value, so PDF-level absence holds. But absence in DB/chain is asserted only against a 13-field projection, not the full production schema, so "unanswerable for the system" is not established.',
         'Targets are implausible for this domain (electricity, carbon, tax ruling, incident recovery time); any system abstains trivially, so discrimination is low.',
         'Superseded by quote-anchored UN-R replacements with near-miss premises.'],'',['pdf absence: manual read, no positive value found'])
for i in [x for x in q if x.startswith('UA-')]:
    if i=='UA-001':
        add(i,'REVISE','C_snapshot_only',['evidence/authorization_probes.json#0','evidence/snapshot.json#authorization'],
            ['Retain as the single representative missing-wallet gateway probe after fixing: (1) conflict - snapshot.json records the credentials-absent probe as observed 400 (expected 401) while authorization_probes.json records 25x HTTP 401; (2) response body not captured (only byte count 89), so non-disclosure is unmeasured; (3) "no model invocation" is inferred, not observed.',
             'The question text never reaches a model; the outcome is independent of wording and identical across variants B1-B4 (output_origin=real_http_authorization_gate_no_model).'],
            'Gateway control test, not a model-accuracy item; exclude from accuracy denominators.',['snapshot authorization: observed=400 expected=401 (conflict)','probe file: 25/25 status 401, response_bytes 89'])
    else:
        add(i,'REJECT','C_snapshot_only',['evidence/authorization_probes.json'],['Same missing-wallet boundary as UA-001; outcome independent of question text; a pseudo-replicate of one test. Add distinct cases instead (expired token, unassigned wallet, wrong DAO scope, replayed nonce).'])
direct_dup={'UN-R005':'UN-R003/R004','UN-R006':'UN-R003/R004','UN-R013':'UN-R011/R012/R015','UN-R014':'UN-R011/R012/R015','UN-R019':'UN-R018/R020'}
for r in rep:
    i=r['replacement_id']; d='pilot' if ('Pilot' in r['authoritative_source']) else 'training'; found=norm(r['exact_quote']) in DOC[d][r['page']-1]
    chk=[f'exact quote found on p{r["page"]} of {d} PDF (auditor extraction): {found}']; iss=[]; dec='ACCEPT'
    note='Category: PDF-bounded false-premise rejection; correct only if the answer declines the premise and supplies no value from DB/chain.'
    if i in direct_dup: dec='REJECT'; iss.append(f'Redundant evidence boundary: same PDF sentence and construct as {direct_dup[i]}; cap 2-3 items per sentence.')
    if i=='UN-R010': dec='REVISE'; iss.append('"by this PDF alone" conflicts with a platform that may legitimately report the chain outcome; reword to "What voting outcome does this PDF state?" and require source attribution.')
    if i in('UN-R003','UN-R004'): iss.append('Quote supports "not proven", weaker than "no value stated"; acceptable because no date/reference appears anywhere in the PDF (auditor read).')
    if i in('UN-R012','UN-R015'): note+=' High-value contrast item: DB/chain hold an on-chain ID/vote tally, so answering from them violates the PDF scope.'
    if not found: dec='REJECT'; iss.append('quote not found')
    add(i,dec,'A_independent',[f'{r["authoritative_source"]} p{r["page"]}'],iss,note,chk)
    rows[-1]['question']=r['question']; rows[-1]['expected_answer']=r['expected_answer']; rows[-1]['category']='UN'
L='cleanup'; ob=chain[L]['observations']; w=int(ob['endsAt'])-int(ob['startsAt'])
dbw=(datetime.datetime.fromisoformat(snap['database'][L]['ends_at'])-datetime.datetime.fromisoformat(snap['database'][L]['starts_at'])).total_seconds()
add('DB-R021','ACCEPT','B_cross_source',['evidence/snapshot.json#database.cleanup','evidence/independent_chain_check.json#cleanup'],[],'Replaces DB-021. Gold not derivable from scope context.',[f'DB window={dbw} s, chain window={w} s: {dbw==w==3600}'])
rows[-1]['question']='How long is the selected cleanup proposal database voting window in seconds?'; rows[-1]['expected_answer']='3600'; rows[-1]['category']='DB'
isrep=lambda r:'-R' in r['id']
for r in rows:
    r['confirmatory_eligible']=r['decision']=='ACCEPT' and not r['exposed_to_systems']
    r['verification_gap']=r['verification_tier'].startswith('C')
json.dump(rows,open('review/independent_audit/independent_adjudication.json','w'),indent=1,ensure_ascii=False)
with open('review/independent_audit/independent_adjudication.csv','w',newline='',encoding='utf-8') as f:
    w_=csv.writer(f); w_.writerow(['id','category','decision','verification_tier','exposed_to_systems','confirmatory_eligible','evidence_refs','issues','scoring_note'])
    for r in rows: w_.writerow([r['id'],r['category'],r['decision'],r['verification_tier'],r['exposed_to_systems'],r['confirmatory_eligible'],' | '.join(r['evidence_refs']),' | '.join(r['issues']),r['scoring_note']])
orig=[r for r in rows if not isrep(r)]; new=[r for r in rows if isrep(r)]
print('originals',len(orig),collections.Counter(r['decision'] for r in orig))
for c in ['DB','PDF','MS','CX','UN','UA']:
    s=[r for r in orig if r['category']==c]; print(c,dict(collections.Counter(r['decision'] for r in s)),'tiers(ACCEPT)',dict(collections.Counter(r['verification_tier'][0] for r in s if r['decision']=='ACCEPT')))
print('new',[(r['id'],r['decision']) for r in new])
acc=[r for r in orig if r['decision']=='ACCEPT']
print('orig ACCEPT',len(acc),'snapshot-only',sum(r['verification_gap'] for r in acc),'exposed',sum(r['exposed_to_systems'] for r in acc),'confirmatory',sum(r['confirmatory_eligible'] for r in acc))
na=[r for r in new if r['decision']=='ACCEPT']; print('new ACCEPT',len(na),'(UN:',sum(r['id'].startswith('UN') for r in na),')')
print('REVISE:',[r['id'] for r in rows if r['decision']=='REVISE'])
print('REJECT originals (non UN/UA):',[r['id'] for r in orig if r['decision']=='REJECT' and r['category'] not in('UN','UA')])
print('AMOUNTS',AM,'| total eligible incl replacements',len(acc)+len(na),'| confirmatory',sum(r['confirmatory_eligible'] for r in rows))
print('C-tier accepted ids',[r['id'] for r in acc if r['verification_gap']])
