"""Descriptive analysis only; generation never imports this file or the gold."""
import collections,csv,datetime,functools,hashlib,json,math,random,re,statistics,sys
from decimal import Decimal
from pathlib import Path
H=Path(__file__).resolve().parents[1];D=H.parent;R=D/'research_evaluation';AI=Path('E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server')
sys.path.insert(0,str(AI))
from app.business.agents.claims import verify_claims
from app.business.agents.quality import verify_citations

def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(n,x):(H/n).write_text(json.dumps(x,indent=2,ensure_ascii=False,default=str)+'\n',encoding='utf8')
@functools.lru_cache(maxsize=None)
def raw(n):
 p=H/'raw'/n
 return [json.loads(s) for s in p.read_text(encoding='utf8').splitlines()] if p.exists() else []
def csvout(n,rows,fields):
 with (H/n).open('w',encoding='utf8',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows({k:r.get(k) for k in fields} for r in rows)
def wilson(k,n):
 if not n:return None
 z=1.959963984540054;p=k/n;den=1+z*z/n;center=(p+z*z/(2*n))/den;half=z*math.sqrt((p*(1-p)+z*z/(4*n))/n)/den
 return [max(0,center-half),min(1,center+half)]
def cluster_ci(rows,key):
 groups={s:[r for r in rows if r.get('scope_label')==s] for s in set(r.get('scope_label') for r in rows)}
 if len(groups)<2:return None
 rng=random.Random(110911);keys=sorted(groups);values=[]
 for _ in range(2000):
  sampled=[r for s in rng.choices(keys,k=len(keys)) for r in groups[s]];values.append(sum(r[key] for r in sampled)/len(sampled))
 values.sort();return [values[int(.025*(len(values)-1))],values[int(.975*(len(values)-1))]]
def nums(s):return [Decimal(x.replace(',','')) for x in re.findall(r'(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\w)|(?<![\w.])-?\d+(?:\.\d+)?(?!\w)',s)]
def norm(s):
 s=s.casefold().replace('\u2019',"'").replace('\u2013','-').replace('\u2014','-').replace('\u00a0',' ')
 s=re.sub(r'\beuros?\b|€','eur',s);s=s.replace('four-week','4-week').replace('three-week','3-week')
 return re.sub(r'\s+',' ',s).strip()
ABSTAIN=re.compile(r"\b(?:unknown|unavailable|cannot|can't|not (?:available|provided|specified|stated|establish|present|found)|no (?:information|data|available|evidence|access)|does not (?:provide|specify|state|establish|contain|identify|prove)|do not have|not enough|insufficient)\b",re.I)
def proxy(answer,gold):
 if not answer:return False
 body=re.sub(r'\[(?:D|G|B)\s*\d+\]','',answer)
 body=re.sub(r'\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b','',body,flags=re.I)
 if gold['expected_behavior'] in ('abstain','deny','bounded_abstention_or_reject_false_premise'):return bool(ABSTAIN.search(body))
 expected=norm(gold['expected_answer']);value=norm(body)
 if expected and expected in value:return True
 needed=collections.Counter(nums(expected));found=collections.Counter(nums(value))
 return bool(needed) and all(found[k]>=n for k,n in needed.items()) and ('eur' not in expected or 'eur' in value)
def main():
 qs=read(R/'exploratory_frozen_v2/remaining_unexposed_questions.json');qby={x['id']:x for x in qs}
 gold={x['id']:x for x in read(R/'benchmark_200/versions/claude_adjudicated_v3/confirmatory_gold.json')}
 observations=raw('responses.jsonl')+raw('frozen_rag_responses.jsonl')+raw('../live_campaign/raw/responses.jsonl');assert len({(r['id'],r['model'],r['condition']) for r in observations})==len(observations)
 scored=[];claims=[]
 for r in observations:
  assert r['id'] in qby
  answer=r.get('answer') or '';sources=r.get('sources') or [];report=verify_claims(answer,sources);refs=verify_citations(answer,sources)
  calls=r.get('provider_calls',[]);complete=[c['response'] for c in calls if c.get('response') and c['path']=='/api/chat'];body=answer.replace(r['question'],'')
  x={k:r.get(k) for k in ['id','model','condition','category','scope_label','wall_ms','error','status','output_origin']}
  x.update(reference_match_proxy=int(proxy(body,gold[r['id']])),whole_answer_correctness=None,abstained=int(bool(ABSTAIN.search(body))),failed=int(r.get('status')=='failed' or not answer),sources_n=len(sources),structural_valid=int(refs['valid']),cited_ids_n=len(refs['cited']),unknown_ids_n=len(refs['unknown']),malformed_ids_n=len(refs.get('malformed',[])),factual_claims_n=report['claims_factual'],flagged_claims_n=report['unsupported_claims'],supported_claims_n=report['counts'].get('supported',0),unchecked_claims_n=report['counts'].get('unchecked_cited',0),provider_chat_attempts=sum(c['path']=='/api/chat' for c in calls),input_tokens_observed=sum(c.get('prompt_eval_count',0) for c in complete) if complete else None,output_tokens_observed=sum(c.get('eval_count',0) for c in complete) if complete else None,provider_token_missing=sum('response' not in c for c in calls),query_embedding_ms=r.get('retrieval_embedding_ms'),query_embedding_tokens=r.get('retrieval_embedding_tokens'))
  x.update(expected_behavior=gold[r['id']]['expected_behavior'],appropriate_abstention=int(gold[r['id']]['expected_behavior']!='facts' and x['abstained']),false_abstention=int(gold[r['id']]['expected_behavior']=='facts' and x['abstained']))
  x.update(has_answer=int(bool(answer)),has_warnings=int(bool(r.get('warnings'))),extraction_hits=len(r.get('extractions',[])),embedding_tokens_observed=sum(c.get('response',{}).get('prompt_eval_count',0) for c in calls if c['path'] in ('/api/embed','/api/embeddings')))
  x.update(observed_200_chat_responses=sum(c['path']=='/api/chat' and c.get('http')==200 for c in calls),chat_error_records=sum(c['path']=='/api/chat' and (bool(c.get('error')) or c.get('http',200)>=400) for c in calls))
  x.update(recorded_timestamp_utc=r.get('started_utc'),timestamp_semantics='recorded at completion despite legacy started_utc name' if r['condition'] in ('B3','B4','A1','A2','A12') else 'actual recorded start')
  scored.append(x)
  for index,c in enumerate(report['claim_checks'],1):claims.append({'id':r['id'],'model':r['model'],'condition':r['condition'],'claim_index':index,**c})
 save('raw/automatic_claim_diagnostics.json',claims);csvout('per_question_automatic_metrics.csv',scored,list(scored[0]) if scored else ['id','model','condition'])
 groups=[]
 for key in sorted({(r['model'],r['condition']) for r in scored}):
  rows=[r for r in scored if (r['model'],r['condition'])==key];n=len(rows)
  g={'dataset':'formerly-reserved-133-exploratory','model':key[0],'condition':key[1],'attempted_n':n,'planned_n':133,'completed_n':sum(r['status']=='completed' for r in rows),'failed_n':sum(r['failed'] for r in rows),'reference_match_proxy_n':sum(r['reference_match_proxy'] for r in rows),'whole_answer_accuracy':None,'human_scored_n':0,'structural_valid_answer_n':sum(r['structural_valid'] for r in rows),'cited_answer_n':sum(r['cited_ids_n']>0 for r in rows),'abstention_cue_n':sum(r['abstained'] for r in rows),'retrieved_sources_answer_n':sum(r['sources_n']>0 for r in rows),'factual_claims_n':sum(r['factual_claims_n'] for r in rows),'automatically_flagged_claims_n':sum(r['flagged_claims_n'] for r in rows),'automatically_supported_claims_n':sum(r['supported_claims_n'] for r in rows),'unchecked_claims_n':sum(r['unchecked_claims_n'] for r in rows),'median_wall_s':statistics.median(r['wall_ms'] for r in rows)/1000,'input_tokens_observed':sum(r['input_tokens_observed'] or 0 for r in rows),'output_tokens_observed':sum(r['output_tokens_observed'] or 0 for r in rows),'token_unobserved_calls_n':sum(r['provider_token_missing'] for r in rows),'chat_attempts_n':sum(r['provider_chat_attempts'] for r in rows),'reference_match_cluster_bootstrap_95':cluster_ci(rows,'reference_match_proxy'),'failure_cluster_bootstrap_95':cluster_ci(rows,'failed')};g.update(expected_answerable_n=sum(r['expected_behavior']=='facts' for r in rows),expected_bounded_unknown_n=sum(r['expected_behavior']!='facts' for r in rows),appropriate_abstention_cue_n=sum(r['appropriate_abstention'] for r in rows),reference_answerable_abstention_cue_n=sum(r['false_abstention'] for r in rows),unauthorized_disclosure_rate=None,authorization_questions_n=0,recognized_citation_ids_n=sum(r['cited_ids_n'] for r in rows),unknown_citation_ids_n=sum(r['unknown_ids_n'] for r in rows),malformed_marker_answer_count=sum(r['malformed_ids_n']>0 for r in rows));g.update(returned_n=sum(r['has_answer'] for r in rows),partial_or_clarification_n=sum(r['status']!='completed' and not r['failed'] for r in rows),warning_answer_n=sum(r['has_warnings'] for r in rows),extractor_hit_n=sum(r['extraction_hits'] for r in rows),embedding_tokens_observed=sum(r['embedding_tokens_observed'] for r in rows));g.update(observed_200_chat_responses_n=sum(r['observed_200_chat_responses'] for r in rows),attempts_without_observed_200_chat_response_n=sum(r['observed_200_chat_responses']==0 for r in rows),chat_error_records_n=sum(r['chat_error_records'] for r in rows));groups.append(g)
 save('aggregate_metrics.json',{'groups':groups,'whole_answer_accuracy':'Not estimated: automatic proxy does not establish semantic correctness','provisional_reference_labels':True,'human_annotations':0})
 csvout('BASELINE_B1_B4_RESULTS.csv',[g for g in groups if g['condition'] in ('B1','B2','B3','B4')],list(groups[0]) if groups else ['dataset','model','condition'])
 smoke=raw('../live_campaign/raw/development_smoke.jsonl') or raw('development_smoke.jsonl');ablations=[{'dataset':'development-smoke-live-SQL-real-model-frozen-chain','id':r['id'],'model':r['model'],'condition':r['condition'],'status':r['status'],'wall_ms':r['wall_ms'],'sources_n':len(r.get('sources',[])),'extractions':','.join(r.get('extractions',[])),'output_origin':r['output_origin'],'warnings':'; '.join(r.get('warnings',[])),'raw_reference':'raw/development_smoke.jsonl'} for r in smoke if r['condition'] in ['B4','A1','A2','A12']]
 
 for original in raw('../live_campaign/raw/responses.jsonl'):
  if original['condition'] in ('B4','A1','A2','A12'):
   ablations.append({'dataset':'formerly-reserved-133-live-exploratory','id':original['id'],'model':original['model'],'condition':original['condition'],'status':original['status'],'wall_ms':original['wall_ms'],'sources_n':len(original.get('sources',[])),'extractions':','.join(original.get('extractions',[])),'output_origin':original['output_origin'],'warnings':'; '.join(original.get('warnings',[])),'raw_reference':'live_campaign/raw/responses.jsonl'})
 for row in ablations:
  original=next(r for r in (smoke if row['dataset'].startswith('development') else raw('../live_campaign/raw/responses.jsonl')) if r['id']==row['id'] and r['model']==row['model'] and r['condition']==row['condition'])
  calls=original.get('provider_calls',[]);row.update(provider_chat_attempts=sum(c['path']=='/api/chat' for c in calls),input_tokens_observed=sum(c.get('response',{}).get('prompt_eval_count',0) for c in calls),output_tokens_observed=sum(c.get('response',{}).get('eval_count',0) for c in calls),token_unobserved_calls_n=sum('response' not in c for c in calls),origin_label_is_heuristic=True)
 for row in raw('../live_campaign/raw/direct_sql.jsonl'):
  ablations.append({'dataset':'DB26-scalar-SQL-exploratory','id':row['id'],'model':None,'condition':'A_SQL','status':row['status'],'wall_ms':row['wall_ms'],'sources_n':1,'extractions':row.get('field'),'output_origin':'direct_SQL','raw_reference':'live_campaign/raw/direct_sql.jsonl','provider_chat_attempts':0,'input_tokens_observed':0,'output_tokens_observed':0,'token_unobserved_calls_n':0,'origin_label_is_heuristic':False})
 csvout('ABLATION_EXPERIMENT_RESULTS.csv',ablations,['dataset','id','model','condition','status','wall_ms','sources_n','extractions','output_origin','warnings','raw_reference','provider_chat_attempts','input_tokens_observed','output_tokens_observed','token_unobserved_calls_n','origin_label_is_heuristic'])
 ledger=[]
 for q in qs:
  seen=[r for r in observations if r['id']==q['id'] and r.get('provider_calls')]
  if seen:ledger.append({'id':q['id'],'previously_reserved':True,'current_status':'exploratory_exposed','first_recorded_start_utc':min(r['started_utc'] for r in seen),'conditions':sorted(set(r['condition'] for r in seen)),'models':sorted(set(r['model'] for r in seen))})
 save('evidence/new_exposure_ledger.json',{'previous_reserved_count':133,'newly_exposed_count':len(ledger),'remaining_unexposed_within_original_reserve':133-len(ledger),'original_reserve_file_unchanged':True,'items':ledger})
 paired=[]
 for model in sorted(set(r['model'] for r in scored)):
  for first,second in [('B1','B2'),('B1','B4'),('B2','B4'),('B3','B4'),('A1','B4'),('A2','B4'),('A12','B4')]:
   a={r['id']:r for r in scored if r['model']==model and r['condition']==first};b={r['id']:r for r in scored if r['model']==model and r['condition']==second};ids=sorted(a.keys()&b.keys())
   if not ids:continue
   pairs=[{'id':i,'scope_label':qby[i]['scope_label'],'delta':b[i]['reference_match_proxy']-a[i]['reference_match_proxy']} for i in ids]
   paired.append({'model':model,'first':first,'second':second,'paired_n':len(ids),'second_only_proxy_match':sum(b[i]['reference_match_proxy'] and not a[i]['reference_match_proxy'] for i in ids),'first_only_proxy_match':sum(a[i]['reference_match_proxy'] and not b[i]['reference_match_proxy'] for i in ids),'mean_paired_proxy_difference':sum(r['delta'] for r in pairs)/len(pairs),'cluster_bootstrap_95':cluster_ci(pairs,'delta'),'mcnemar_p':None,'reason_no_significance_test':'Dependent source facts, four clusters, provisional gold, proxy not correctness'})
 save('paired_descriptive_comparisons.json',paired)
 failures={}
 for model,condition in sorted({(r['model'],r['condition']) for r in observations}):
  rows=[r for r in observations if (r['model'],r['condition'])==(model,condition)];srows=[r for r in scored if (r['model'],r['condition'])==(model,condition)]
  failures[model+' / '+condition]={'attempts':len(rows),'no_final_answer':sum(not r.get('answer') for r in rows),'timeouts':sum('Timeout' in (r.get('error') or '') for r in rows),'transport_errors':sum(bool(r.get('error')) for r in rows),'reference_proxy_not_matched':sum(not r['reference_match_proxy'] for r in srows),'nonempty_without_canonical_citations':sum(bool(r.get('answer')) and not re.search(r'\[(?:D|G)\d+\]',r['answer']) for r in rows),'flagged_factual_claims':sum(r['flagged_claims_n'] for r in srows),'unchecked_claims':sum(r['unchecked_claims_n'] for r in srows)}
 save('failure_taxonomy.json',failures)
 save('analysis_status.json',{'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'benchmark_records':len(observations),'b1_n':sum(r['condition']=='B1' for r in observations),'b2_n':sum(r['condition']=='B2' for r in observations),'planned_b1_b2':532,'live_campaign_n':len(raw('../live_campaign/raw/responses.jsonl')),'planned_live_campaign':1330,'direct_SQL_n':len(raw('../live_campaign/raw/direct_sql.jsonl')),'exposed_questions':len(ledger),'human_annotations':0,'source_valid_claim_cases':24,'claim_checks_executed':26,'development_smoke_n':len(smoke),'frozen_rag_smoke_n':len(raw('frozen_rag_smoke.jsonl'))})
 print(json.dumps({'groups':[(g['model'],g['condition'],g['attempted_n'],g['failed_n'],g['reference_match_proxy_n']) for g in groups],'exposed_questions':len(ledger)}))
if __name__=='__main__':main()

