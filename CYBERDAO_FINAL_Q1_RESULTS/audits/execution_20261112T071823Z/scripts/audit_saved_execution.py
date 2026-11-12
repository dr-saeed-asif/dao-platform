"""Point-in-time audit and offline analysis; never invokes inference or writes campaign raw files."""
import collections, csv, datetime, hashlib, importlib, json, math, shutil, subprocess, sys
from pathlib import Path
H=Path(__file__).resolve().parents[1]; D=H.parent
AI=Path('E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server')
now=datetime.datetime.now(datetime.timezone.utc)
A=Path(sys.argv[1]) if len(sys.argv)>1 else H/'audits'/now.strftime('execution_%Y%m%dT%H%M%SZ')
recover=A.exists()
if recover:now=datetime.datetime.strptime(A.name,'execution_%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
else:A.mkdir(parents=True,exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(name,x):(A/name).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def csvout(name,rs,fields=None):
 with (A/name).open('w',encoding='utf8',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields or list(rs[0]));w.writeheader();w.writerows(rs)
def rows(p):return [json.loads(s) for s in p.read_text(encoding='utf8').splitlines()]
def key(r):return r['id'],r['model'],r['condition']
raws=['raw/responses.jsonl','raw/frozen_rag_responses.jsonl','live_campaign/raw/responses.jsonl']
captured=[]
for name in raws+['live_campaign/raw/development_smoke.jsonl','live_campaign/raw/direct_sql.jsonl','raw/frozen_rag_smoke.jsonl']:
 p=H/name
 if not p.exists():continue
 dest=A/name;dest.parent.mkdir(parents=True,exist_ok=True)
 data=dest.read_bytes() if recover and dest.exists() else p.read_bytes();end=data.rfind(b'\n')+1
 if not dest.exists():dest.write_bytes(data[:end])
 captured.append({'path':name,'bytes':end,'partial_trailing_bytes_not_yet_a_record':None if recover else len(data)-end,'sha256':sha(dest)})
for n in ['scripts/analyze.py','scripts/check_transport.py','b1_configuration.json','b2_configuration.json','live_campaign/configuration.json']:
 dest=A/n;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(H/n,dest)
for n in ['evidence','figures']: (A/n).mkdir(exist_ok=True)
cohort_path=D/'research_evaluation/exploratory_frozen_v2/remaining_unexposed_questions.json'
gold_path=D/'research_evaluation/benchmark_200/versions/claude_adjudicated_v3/confirmatory_gold.json'
qs=read(cohort_path);cfg=read(H/'live_campaign/configuration.json')
assert sha(cohort_path)==cfg['cohort_sha256']
expected={(q['id'],m,c) for q in qs for m in ['qwen3:0.6b','qwen3:4b-instruct'] for c in ['B1','B2','B3','B4','A1','A2','A12']}
rs=[r for n in raws for r in rows(A/n)];actual={key(r) for r in rs}
assert len(actual)==len(rs), 'Duplicate keys'
assert not actual-expected, 'Unexpected keys'
missing=sorted(expected-actual)
csvout('MISSING_ATTEMPTS.csv',[dict(zip(['id','model','condition'],k)) for k in missing],['id','model','condition'])
original_path=H/read(H/'ACTIVE_RESUME.json')['manifest'];original=read(original_path)
old=[r for n in raws for r in rows(original_path.parent/n)]
oldfail={key(r) for r in old if r.get('status')=='failed' or not r.get('answer')}
prefix=[]
for n in raws:
 b=(original_path.parent/n).read_bytes();assert (A/n).read_bytes().startswith(b)
 assert hashlib.sha256(b).hexdigest()==original['preserved_files'][n]['sha256']
 prefix.append({'path':n,'original_prefix_verified':True,'original_bytes':len(b)})
assert len(oldfail)==38
failed=[r for r in rs if r.get('status')=='failed' or not r.get('answer')]
csvout('FAILED_ATTEMPTS.csv',[{'id':r['id'],'model':r['model'],'condition':r['condition'],'historical':key(r) in oldfail,'status':r['status'],'error':r.get('error'),'wall_ms':r['wall_ms']} for r in failed])
# Reuse the frozen analysis logic on copied raw records; outputs go exclusively to A.
import analyze
analyze.H=A
if not (A/'analysis_status.json').exists():analyze.main()
# Original checker assumes its parent is the repository. Adapt only its cohort
# path in memory for the isolated audit directory; all checks remain unchanged.
checker=(A/'scripts/check_transport.py').read_text(encoding='utf8')
checker=checker.replace("H.parent/'research_evaluation",f"Path({str(D)!r})/'research_evaluation")
exec(compile(checker,str(A/'scripts/check_transport.py'),'exec'),{'__file__':str(A/'scripts/check_transport.py')})
(A/'AUDIT_HARNESS_NOTE.md').write_text('The first offline transport-check invocation failed because the unchanged checker inferred a repository-relative cohort path from the isolated audit directory. The audit resumed using the same saved raw snapshot and completed analysis; only the checker cohort path was adapted in memory. No inference, gold changes or score relabeling occurred. Copied checker source remains unchanged. For recovered snapshots, original partial trailing-byte counts were not retained and are reported as unknown.\n',encoding='utf8')
groups=read(A/'aggregate_metrics.json')['groups'];by={(g['model'],g['condition']):g for g in groups}
cells=[]
for m in ['qwen3:0.6b','qwen3:4b-instruct']:
 for c in ['B1','B2','B3','B4','A1','A2','A12']:
  g=by.get((m,c),{});times=sorted(r['wall_ms']/1000 for r in rs if (r['model'],r['condition'])==(m,c))
  cells.append({'model':m,'condition':c,'recorded_n':len(times),'planned_n':133,'missing_n':133-len(times),'failed_n':g.get('failed_n',0),'proxy_match_n':g.get('reference_match_proxy_n') if times else None,'proxy_fraction':g.get('reference_match_proxy_n',0)/len(times) if times else None,'proxy_scope_bootstrap_95':json.dumps(g.get('reference_match_cluster_bootstrap_95')),'median_wall_s':g.get('median_wall_s'),'p95_wall_s':times[math.ceil(.95*len(times))-1] if times else None,'warnings_n':g.get('warning_answer_n',0),'cited_answers_n':g.get('cited_answer_n',0),'structural_valid_n':g.get('structural_valid_answer_n',0),'observed_input_tokens':g.get('input_tokens_observed'),'observed_output_tokens':g.get('output_tokens_observed'),'unobserved_token_calls_n':g.get('token_unobserved_calls_n'),'human_scored_n':0,'independently_adjudicated_accuracy':None})
csvout('B1_B4_COMPARISON.csv',[g for g in cells if g['condition'] in ['B1','B2','B3','B4']])
csvout('ABLATION_RESULTS.csv',[g for g in cells if g['condition'] in ['B4','A1','A2','A12']])
def validate_manifest(path,base):
 manifest=read(path);out=[]
 for n,entry in manifest['files'].items():
  p=AI/n[3:] if n.startswith('ai/') else base/n
  expected_hash=entry if isinstance(entry,str) else entry['sha256']
  out.append({'path':n,'exists':p.exists(),'matches':p.exists() and sha(p)==expected_hash})
 return {'manifest':str(path),'checked':len(out),'matched':sum(r['matches'] for r in out),'nonmatching':[r for r in out if not r['matches']]}
prior=validate_manifest(D/'research_evaluation/ai_independent_part2_v1/AI_REPRODUCIBILITY_MANIFEST.json',D)
partial=validate_manifest(H/'PARTIAL_STATUS_REPRODUCIBILITY_MANIFEST.json',H)
backup_checks=[{'path':n,'matches':sha(original_path.parent/n)==v['sha256']} for n,v in original['preserved_files'].items()]
source_bad=[n for n,v in cfg['source_files'].items() if not (AI/n).exists() or sha(AI/n)!=v]
human=[]
for reviewer in ['A','B']:
 for name,col in [('HUMAN_ANNOTATION_TEMPLATE.csv','decision'),('CLAIM_ANNOTATION_TEMPLATE.csv','gold_label')]:
  p=D/f'research_evaluation/ai_independent_part2_v1/annotation/reviewer_{reviewer}'/name
  with p.open(encoding='utf-8-sig',newline='') as f:annotations=list(csv.DictReader(f))
  human.append({'reviewer':reviewer,'file':name,'rows':len(annotations),'nonempty_label_fields':sum(bool(r.get(col,'').strip()) for r in annotations)})
save('MANIFEST_VERIFICATION.json',{'historical_169':prior,'earlier_partial_status':partial,'resume_backup':backup_checks,'original_raw_prefixes':prefix,'frozen_question_sha256_verified':True,'executed_source_hash_mismatches':source_bad,'final_campaign_manifest_exists':(H/'FINAL_REPRODUCIBILITY_MANIFEST.json').exists()})
save('HUMAN_ANNOTATION_CHECK.json',human)
transport=read(A/'transport_configuration_audit.json')
complete=not missing and not source_bad and transport['configuration_mismatches']==0
status={'captured_utc':now.isoformat(),'status':'COMPLETE' if complete else 'PARTIALLY COMPLETE','expected':1862,'recorded_unique':len(rs),'missing':len(missing),'duplicate_keys':0,'unexpected_keys':0,'parse_errors':0,'historical_failures_preserved':38,'new_failed_attempts':len(failed)-38,'all_failed_attempts':len(failed),'missing_by_condition':dict(collections.Counter(k[2] for k in missing)),'completed_condition_cells':sum(g['recorded_n']==133 for g in cells),'planned_condition_cells':14,'configuration_mismatches':transport['configuration_mismatches'],'human_label_fields_completed':sum(r['nonempty_label_fields'] for r in human),'campaign_completion_marker_exists':(H/'live_campaign/completion.json').exists(),'captured_files':captured}
save('AUDIT_STATUS.json',status)
table='| Model | Condition | Saved/133 | Failures | Proxy matches/saved | Median / p95 seconds |\n|---|---|---:|---:|---:|---:|\n'
for g in cells:
 latency=f"{g['median_wall_s']:.3f} / {g['p95_wall_s']:.3f}" if g['recorded_n'] else 'Not observed'
 match=f"{g['proxy_match_n']}/{g['recorded_n']}" if g['recorded_n'] else 'Not observed'
 table+=f"| {g['model']} | {g['condition']} | {g['recorded_n']}/133 | {g['failed_n']} | {match} | {latency} |\n"
pairs=read(A/'paired_descriptive_comparisons.json');rag_pairs=[p for p in pairs if p['first']=='B2' and p['second']=='B4']
pt='| Model | Same-question pairs | Full minus RAG proxy (percentage points) | Four-scope bootstrap95% interval (pp) |\n|---|---:|---:|---|\n'
for p in rag_pairs:
 lo,hi=p['cluster_bootstrap_95'];pt+=f"| {p['model']} | {p['paired_n']} | {100*p['mean_paired_proxy_difference']:.2f} | [{100*lo:.2f}, {100*hi:.2f}] |\n"
failure_counts=collections.Counter((r.get('error') or 'No final answer without outer exception').split(':',1)[0] for r in failed)
(A/'FAILURE_ANALYSIS.md').write_text(f'''# Preserved failures and diagnostic limits
{len(failed)}/{len(rs)} saved attempts failed:38 historical +{len(failed)-38} new. Error classes:{dict(failure_counts)}. FAILED_ATTEMPTS.csv provides every key and observed error. Counts describe outer exceptions, not independently proven root causes. Timeouts, missing answers, workflow warnings, fallback text, unknown citations and gate flags overlap; failure_taxonomy.json and per_question_automatic_metrics.csv preserve separate counts. All failed attempts remain in proxy denominators. No records were retried, dropped or edited by this audit.

Plain RAG's proxy advantage does not establish better factual accuracy. The few frozen document pages directly expose numeric anchors. The full graph adds opportunities for task expansion/substitution, ordinal-versus-budget confusion, synthesis formatting and conservative gates. Four prior purposive0.6B B4 diagnoses are saved at ../../raw/current_workflow_diagnostic.json. The separate arithmetic replay (../../raw/arithmetic_guard_replay.json) rejected a correct derived9,000 absent literally in evidence; it does not establish the cause of each benchmark miss. A2 removes M7 blocking only, retaining the legacy currency guard. The proxy can count wrong field/value associations as matches and miss sound paraphrases. Eight prior purposive RAG reviews and four selected numeric claims are AI-assisted diagnostics, not representative human validation. No causal attribution or general error prevalence follows from these observations.
''',encoding='utf8')
(A/'STATISTICAL_ANALYSIS.md').write_text(f'''# Exploratory statistics — fixed partial snapshot
Captured {now.isoformat()}; {len(rs)}/1,862 expected records. Every model/condition uses its actual saved denominator; planned cells remain133. Do not compare the partial4B B3 subset as if it were the full matched cohort. Failed attempts count as proxy nonmatches. Whole-answer correctness, independent claim support and unauthorized disclosure are not estimated.

{pt}
Reference matching is the existing frozen normalized-text/numeric-anchor or bounded-abstention-cue proxy, not semantic answer accuracy. CI:2,000 bootstrap resamples of four proposal scopes,seed110911; paired differences join identical question IDs, including failures. Only four clusters, shared facts, provisional AI-assisted references and fixed-seed outputs make these intervals unstable conditional descriptions, not population guarantees. No significance test is claimed. Missing4B Full prevents a4B RAG-versus-Full comparison.

Latency:median and nearest-rank p95 over all saved attempts, including failures. B2 generation timing excludes cached retrieval/setup; hardware residency, queueing and phases differ. Configured async deadlines are not absolute observed wall-time bounds; raw overruns are retained. Missing provider token reports are unknown, not zero cost. Claim-gate output and structural citation validity are automated diagnostics, not independent claim-level scoring. Structural validity can include uncited/empty responses; cited-answer counts are separate in CSVs.
''',encoding='utf8')
(A/'BENCHMARK_EXECUTION_AUDIT.md').write_text(f'''# CyberDAO benchmark execution audit
**{status['status']} — snapshot {now.isoformat()}.**

{len(rs)}/1,862 expected attempt records are parseable and uniquely keyed; {len(missing)} missing. Completed cells:{status['completed_condition_cells']}/14. Missing by condition:{status['missing_by_condition']}. The runner was active at this audit; a completion marker was not present at initial inspection. This audit launched no inference and never altered production, gold or campaign raw files. Tables below are provisional observations, not final full-campaign scores.

{table}
{pt}
All original1,239 records retain their exact raw prefixes. All38 historical failures are preserved; {len(failed)-38} new failures are also retained. All failures remain in denominators. B1=no evidence; B2=plain frozen-document RAG; B3=single agent with22 permitted tools; B4=full graph and gates; A1=deterministic helpers off; A2=M7 blocking off only; A12=both. Full uses archived chain replay and trusted in-process operator context, not live HTTP/C4/C7 validation. Six-call/200-second case budgets and normalized seed42,temperature0.6,context8192,prediction1536 settings remain frozen. Effective transport mismatches:{transport['configuration_mismatches']}; source-hash mismatches:{len(source_bad)}. Wire hashes computed before privacy redaction are separately distinguished from configuration errors.

Human annotation labels present:{status['human_label_fields_completed']}; no independently human-adjudicated confirmatory result is claimed. These are exploratory automated reference matches, NOT independently adjudicated answer accuracy. Few documents/four shared scopes, four unavailable field projections, a fixed seed, architecture-specific prompts, conservative fallbacks, timeouts, retrieval phase and cache/GPU effects limit interpretation.

Reproducibility:historical manifest matched {prior['matched']}/{prior['checked']}; saved resume backup matched {sum(r['matches'] for r in backup_checks)}/{len(backup_checks)}; source configuration and question hash verified. The earlier partial-status manifest matches {partial['matched']}/{partial['checked']} current files:changed append-only results/status files make it stale for the present tree; see MANIFEST_VERIFICATION.json. This does not imply original raw corruption:archived prefixes were separately verified. A final campaign manifest does not yet exist. The audit's AUDIT_REPRODUCIBILITY_MANIFEST.json seals this fixed snapshot and all derived files.

Outstanding:finish all missing attempts, preserve additional failures, then run the prepared offline finalizer and verify the final campaign manifest. Human adjudication and its evidence-freeze prerequisites remain pending for confirmatory claims. Existing raw/results are preserved. No model runs were restarted by this audit.
''',encoding='utf8')
sys.path.insert(0,str(H/'.plot_deps'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams.update({'font.size':8,'svg.fonttype':'none','pdf.fonttype':42})
for conditions,name in [(['B1','B2','B3','B4'],'baseline'),(['B4','A1','A2','A12'],'ablation')]:
 selected=[g for g in cells if g['condition'] in conditions]
 fig,axes=plt.subplots(1,2,figsize=(9,3.8));labels=[g['model'].replace('qwen3:','')+' '+g['condition']+f"\n{g['recorded_n']}/133 saved" for g in selected]
 for i,g in enumerate(selected):
  if g['recorded_n']:
   axes[0].bar(i,g['proxy_fraction'],color='#376b99');axes[1].bar(i,g['median_wall_s'],color='#55816b')
  else:
   for ax in axes:ax.text(i,.03,'Not run',rotation=90,transform=ax.get_xaxis_transform(),ha='center')
 for ax in axes:ax.set_xticks(range(len(labels)),labels,rotation=45,ha='right');ax.spines[['top','right']].set_visible(False)
 axes[0].set_ylim(0,1);axes[0].set_ylabel('Automated reference-match fraction');axes[0].set_title('Exploratory proxy; not answer accuracy')
 axes[1].set_ylabel('Median observed wall time (s)');axes[1].set_title('Saved attempts including failures')
 fig.suptitle('PARTIAL campaign snapshot; missing cells are not zero scores');fig.tight_layout()
 for ext in ['svg','pdf','png']:fig.savefig(A/f'figures/{name}.{ext}',dpi=160)
 plt.close(fig)
shutil.copyfile(__file__,A/'scripts/audit_saved_execution.py')
files={p.relative_to(A).as_posix():{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(A.rglob('*')) if p.is_file()}
git=lambda repo:subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
save('AUDIT_REPRODUCIBILITY_MANIFEST.json',{'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'classification':'Exploratory point-in-time partial campaign audit','git_base_commits':{'dao':git(D),'ai':git(AI)},'executed_source_identity':'live_campaign/configuration.json source hashes; HEAD alone does not identify uncommitted executed source','cohort_sha256':sha(cohort_path),'gold_sha256':sha(gold_path),'files':files,'excluded':'This manifest itself; no private environment files copied'})
assert all(sha(A/n)==e['sha256'] for n,e in files.items())
print(json.dumps({'audit_directory':str(A),**status,'audit_manifest_files_verified':len(files),'historical_manifest_verified':prior['matched'],'prior_partial_manifest_current_mismatches':len(partial['nonmatching'])}))
