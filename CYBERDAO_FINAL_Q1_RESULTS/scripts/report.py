"""Generate concise manuscript reports from calculated metrics, never target counts."""
import json
from pathlib import Path
from analyze import H,R,read,wilson,raw

def write(n,text):(H/n).write_text(text.strip()+'\n',encoding='utf8')
def main():
 a=read(H/'aggregate_metrics.json');s=read(H/'analysis_status.json');g=[x for x in a['groups'] if x['condition'] in ('B1','B2','B3','B4')];c=read(H/'raw/claim_challenge_final_panel.json');audit=read(H/'evidence/provenance_audit.json')
 table='| Model | Condition | Attempts / planned | Returned | Failed | Reference-match proxy | Citation-valid answers | Median wall (s) | Observed input/output tokens |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n'
 for x in g:table+=f"| {x['model']} | {x['condition']} | {x['attempted_n']}/{x['planned_n']} | {x.get('returned_n',x['completed_n'])} | {x['failed_n']} | {x['reference_match_proxy_n']}/{x['attempted_n']} | {x['structural_valid_answer_n']}/{x['attempted_n']} | {x['median_wall_s']:.3f} | {x['input_tokens_observed']}/{x['output_tokens_observed']} |\n"
 if not any(x['condition'] in ('B3','B4') for x in g):table+='| Both models | B3/B4 benchmark | 0/532 | — | — | Not yet executed | — | — | — |\n'
 ct='| Metric | Count | Estimate | Conditional Wilson 95% interval |\n|---|---:|---:|---|\n'
 for name,k,n in [('Semantic-support precision',c['tp'],c['tp']+c['fp']),('Semantic-support recall',c['tp'],c['tp']+c['fn']),('False-positive rate',c['fp'],c['fp']+c['tn']),('Abstention',12,24),('Classification coverage',12,24)]:
  lo,hi=wilson(k,n);ct+=f'| {name} | {k}/{n} | {k/n:.3f} | [{lo:.3f}, {hi:.3f}] |\n'
 hist='''| Experiment/version | Actual result | Evidence and boundary |
|---|---|---|
| Small-model pilot | Full 8/8, gate-off 8/8, forced-evidence 4/8, LLM-only 0/8 gold-fact matches | 32 runs: four questions, two repeats, four variants. Lexical metric, not answer accuracy. ../research_evaluation/raw_results/pilot-small/runs.jsonl |
| Historical claim review | 15/16 supported; 1/16 contradicted; 14/16 explicitly cited | Unblinded AI-assisted review of four first-repeat answers. ../research_evaluation/analysis/first-pass-claim-review.csv |
| Streaming | 3/3 completed; median first section 3.318 s, final event 3.430 s | One question repeated through FastAPI; not browser/Nest latency. ../research_evaluation/analysis/streaming-summary.json |
| Original reconciliation | 23 verified, 7 mismatched, 9 unverified /39 | Original verifier and varying pins. ../research_evaluation/springer/reconciliation.jsonl |
| Post-status-alias targeted subset | 0 verified, 1 mismatched, 6 unverified /7 | Six status comparisons agree; missing winner/tie fields remain. ../research_evaluation/springer_followup/reconciliation.jsonl |
| C7 original-DB fixed-pin follow-up | 0 verified, 1 mismatched, 38 unverified /39 | Scoped checkpoint version mismatch v1 versus 1; 6 status aliases match; extra SQL assignment remains. ../research_evaluation/experiment_1_m4/reconciliation_39_comparison.md |
| Prior isolated recovery | 39 recovered; 24 verified, 15 unverified; 51.110 s | 110 assignments, 30 votes. ../research_evaluation/recovery_m4/ |
| Completeness follow-up | 39/39 recovered and verified; zero mismatched/unverified/failed; 51.896 s | Fixed block 20325000, one RPC provider. ../research_evaluation/recovery_completeness/results-01/RECOVERY_COMPLETENESS_REPORT.md |
| M5 document controls | Invalid rejection 11/12 before, 12/12 after; valid 3/3 both | Final indexed-evidence gate; not initial staging admission. Synthetic anchors/embeddings, real isolated SQL/parser. ../research_evaluation/m5_m6_postfix/M5_M6_POST_FIX_REPORT.md |
| Stale active chunks | Physical cleanup 0/1 before, 1/1 after | Audit metadata retained; not backup erasure. Same M5 report |
| M6 fault classification | 15/16 expected classifications, before/after | Coherently stale view indistinguishable from clean input; no independent RPC. Same M5/M6 report |
| Original six fault controls | TP4, FP1, FN0, TN1 | Alias false positive; affected retest verified. Separate from M6. ../research_evaluation/springer/fault_injection.json |
| Historical authorization | HTTP negatives 6/6; wallet 5/5; DTO/auth 3/3; isolated tool denials 4/4 | Separate protocols, not one denominator. Malformed DTO 400 versus valid unauthorized DTO 401. ../research_evaluation/FINAL_PAPER_EVIDENCE.md |
| Earlier frozen AI comparison | B1 2/8; historical tool-B2 2/8; historical ablated-B3 0/8; B4 1/8 | AI-assisted whole-answer judgments; 18 harness-invalid originals retained. Definitions differ from current campaign. ../research_evaluation/exploratory_frozen_v2/summary.json |
| M7 development | Before TP3/FP9/FN0/TN5; after TP3/FP0/FN0/TN14, n=17 | Synthetic development labels, not independent evaluation. ../../api-ai-server1/api-ai-server/benchmark/m7/development-results.json |
'''
 write('BENCHMARK_AUDIT.md',f'''# Benchmark audit
200 originals plus 26 replacement candidates form 226 review items. The prior Claude AI-assisted audit accepted 155, revised 15 and rejected 56. Excluding 14 initially exposed accepted items left 141; eight later exposures left 133 reserved candidates. Categories: DB26, PDF35, multi-source27, complex/arithmetic28, bounded-unknown17; unauthorized-access0. Reference labels primarily use four proposal scopes and two synthetic demonstration PDFs. Frozen RAG also has the existing one-page cleanup proposal: three PDFs/six page chunks total. All three copied source PDFs match their captured SHA-256 identities and all six normalized page chunks match the PDF text; see evidence/document_freeze.json. No new questions were added. Benchmark function calls use a trusted in-process operator context, bypassing HTTP identity/startup checks solely for research instrumentation; this does not evaluate deployed C4 identity or C5 credential cutover.

All {audit['previous_hashes_matching']}/{audit['previous_hashes_checked']} prior manifest hashes match. All 133 IDs have provisional source-linked gold; exact IDs and question strings are unique. Shared facts, near-duplicates and low-discrimination questions remain. Machine source checking and Claude review are not independent human validation. Earlier title-leakage exclusions remain excluded. No gold is loaded by generation scripts.

Archive-to-preflight field checks are recorded in evidence/snapshot_drift_checks.json; missing projected fields remain unchecked. This is source consistency, not independent ground-truth validation.

The new exposure ledger records {s['exposed_questions']} formerly reserved items as exploratory-exposed. Original files are unchanged; their old unexposed flags are historical, not current eligibility. Confirmatory eligible count remains zero.

Current definitions: B1 LLM-only; B2 plain document RAG; B3 equivalent-tool single agent; B4 full CyberDAO. Historical B2/B3 labels are not relabelled retroactively. Frozen-corpus B2 uses actual archived page chunks and real embeddings/cosine ranking, not live PostgreSQL. B3/B4 benchmark and new SQL baseline are infrastructure-blocked. See evidence/provenance_audit.json, evidence/source_records.json, configuration files and evidence/new_exposure_ledger.json.''')
 write('HUMAN_ANNOTATION_STATUS.md','''# Human annotation status
No genuine completed human annotations exist. Two separate 226-row templates remain blank under ../research_evaluation/ai_independent_part2_v1/annotation/reviewer_A/ and reviewer_B/. Proposed gold is a separate sidecar; claim templates are also blank. No agreement coefficient is estimable and no HUMAN_AGREEMENT_REPORT is generated.

The existing human_adjudication_v2 instructions, importer and third-reviewer adjudication tracking remain applicable. Exploratory execution does not override confirmatory gates. Attempted reserve items are now exposed in the new ledger. AI-assisted review is never described as human adjudication.''')
 nabl=len([r for r in raw('development_smoke.jsonl') if r['condition'] in ['B4','A1','A2','A12']])
 write('FINAL_SCIENTIFIC_TABLES.md',f'''# Scientific tables
All new AI observations are exploratory. Gold is AI-assisted; reference matching is not semantic whole-answer accuracy. Failures stay in attempt denominators.

## Table 1. Baselines
{table}
## Table 2. Ablations
{nabl} actual development observations across B4/A1/A2/A12 are in ABLATION_EXPERIMENT_RESULTS.csv: two questions, 0.6B only. There is no 133-question ablation comparison. A1 disables five direct-answer helpers and budget_answer; A2 disables workflow/synthesis M7 blocking_flags only; A12 combines them. Structural citation/currency checks remain active. Extraction helper hits are recorded directly. Output-origin labels are heuristics, not proof of claim-level generation ancestry; token observations are retained. Direct SQL is blocked; B2 is also the plain-retrieval condition and is not double-counted.

## Table 3. Claim challenge
{ct}
24 unique provisional cases: 18 synthetic patterns and six archived-PDF challenges. Two source-page construction errors were corrected by two targeted checks; all original 24 outputs remain. Total actual gate attempts26; source-valid final panel24. No code or answer label changed. CH-010/011 are semantically true but deliberately lack valid attribution, so semantic-support recall includes their correct rejection as false negatives. Acceptance on validly cited supported cases is 4/6. This is not an independent held-out entailment evaluation.

## Table 4. Failures
failure_taxonomy.json reports overlapping counts: missing outputs, timeouts, transport errors, absent citations, reference mismatches, automatically flagged and unchecked claims. These are automatic diagnostics, not human error judgments.

## Table 5. Performance
Table 1 and per_question_automatic_metrics.csv contain actual wall time and observed tokens. Frozen B2 query embeddings are computed once and reused across models; recorded embedding time/setup is separate from generation wall. Concurrency two, GPU offload, caches and queueing constrain comparisons. Missing failed-call tokens are unobserved. API costs and energy were not metered.

## Table 6. Human annotation
Completed paired human reviews0. Agreement and confirmatory accuracy are not estimable.

## Historical results retained by version
{hist}''')
 comparisons=read(H/'paired_descriptive_comparisons.json')
 write('STATISTICAL_ANALYSIS.md',f'''# Statistical analysis
Each question is counted once within each model/condition. Models are separate; fixed-seed outputs are not independent replications. Cluster-bootstrap intervals resample four proposal scopes, 2,000 draws, seed110911; paired differences join identical IDs. See aggregate_metrics.json and paired_descriptive_comparisons.json.

Paired descriptive results: {json.dumps(comparisons)}

These conditional intervals do not account for annotation uncertainty, and four source clusters provide weak population inference. McNemar p-values are withheld because independent-pair assumptions and reliable correctness labels are unmet. No statistical-significance claim is made.

Reference matching requires normalized exact text or all numeric anchors with currency where required; bounded-unknown cues cover the actual saved enum. It can accept swapped labels or contradictions and miss valid paraphrases. It must never be called whole-answer accuracy; that field stays null. The corrected enum handling, failing regression and old tables are preserved in versions/scoring_v1 and versions/SCORING_CORRECTION.md.

Claim Wilson intervals are conditional descriptions of selected provisional cases, not independent generalization bounds. Structural validity and claim support are separate. The gate's own flags are automatic evidence-policy diagnostics, not independently validated factual-error rates or mathematical lower bounds. A true arithmetic/paraphrase claim can still be flagged, and uncited facts may be true. Reference-answerable abstention counts do not imply that a model deprived of the required sources should guess. Latency includes failed attempts; B2 cached retrieval and setup are reported separately. Unknown tokens are not zero cost.''')
 write('FAILURE_ANALYSIS.md',f'''# Failure analysis
{json.dumps(read(H/'failure_taxonomy.json'),indent=2)}

Labels overlap. Per-question metrics and raw provider records retain evidence. The source-page errors and scoring-enum correction are research-harness defects, preserved with pre-fix versions. No gold or output was changed.

Original development smoke preserved 18 completed attempt records: 14 small-model and four larger-model, including two 4B timeouts. The number of additional in-flight requests lost during interruption is unknown; 18 is the recorded-output denominator, not a claim of complete start-event accounting. The preflight listing limit100 violated the documented maximum50; v2 changes only the research inspection request and recognizes the count tool's direct-result contract. The remaining database-backed smoke was blocked by Docker's analytics-socket startup failure.

Historical routing coverage, synthesis framing and wrong budget-label failures remain under ../research_evaluation/failure_diagnosis/. Two historical B4 claims passed structural validation despite wrong field-value support. They remain documented and are not erased by later M7 tests. New full-cohort orchestration underperformance cannot be attributed without B3/B4 execution. The challenge found unchecked PDF table relationships and attribution/coverage tradeoffs, not general semantic correctness.''')
 write('Q1_MANUSCRIPT_RESULTS_REVISION.md',f'''# Manuscript replacement text
No manuscript .tex/.docx source was located in the repository/workspace search; this is author-ready replacement prose, not an edited submitted manuscript. No references are invented.

## Abstract
CyberDAO separates advisory AI from governance transaction authority and combines scoped reads, document provenance checks and blockchain reconciliation. An isolated recovery follow-up reconstructed and reconciled39/39 original proposals at a fixed block using one RPC provider. Selected document controls rejected12/12 invalid cases and admitted3/3 valid controls; stale active-chunk cleanup succeeded in one replacement case. RPC fault expectations matched15/16 controlled cases. AI results remain exploratory: gold is AI-assisted, human adjudication is absent, and a database outage prevented the new full-workflow campaign. The evidence supports design feasibility within tested boundaries, not independently validated AI accuracy or blockchain-integrity guarantees.

## Research questions, contributions and methods
Separate engineering consistency/provenance from answer-quality questions. Contribution4 is deterministic field/value/unit/citation checking for selected parseable formats, not entailment. Use current baseline definitions and actual model digests/configurations; retain historical definitions separately. The133-question cohort spans four proposal scopes with two main demonstration PDFs; the retrieval corpus additionally includes the existing cleanup PDF. It is now exposed to exploratory model runs, not a human-approved confirmatory reserve.

## Results
{table}
This table contains reference-match proxies, not answer accuracy. Whole-answer correctness and independent claim support remain unmeasured. Do not insert proxy counts into an accuracy column.

The new24-case provisional claim challenge yielded TP4/FP0/FN4/TN16 with12/24 abstentions. Two semantically true claims deliberately lacked valid attribution. Four of six validly cited supported cases were accepted. Preserve the earlier17-case development results and historical budget-label errors as separate versions. All comparisons are exploratory; selected cases do not establish generalization.

## Discussion, limitations and conclusion
Recovery measures same-provider consistency, not independent chain integrity, finality or absence of silent omissions. Scan progress is distinct from proven completeness. The historical extra SQL assignment linked to a reverted transaction remains preserved in production; isolated recovery does not repair it. Synthetic document anchors/embeddings, selected faults, provisional gold, shared facts, limited source diversity, architecture-specific prompts, GPU/caching effects and blocked full-workflow runs constrain conclusions. No system-superiority or significance claim is justified. Frame the contribution as design-and-feasibility with exploratory AI observations.

## Availability
Use FINAL_SCIENTIFIC_TABLES.md and REPRODUCIBILITY_MANIFEST.json for exact versions, denominators and evidence links. Release only redacted artifacts. Local implementation does not imply deployment, secret rotation or formal security audit.''')
 write('REVIEWER_RESPONSE_MATRIX.md','''# Evidence-to-reviewer mapping
| Finding | Supported evidence | Remaining boundary |
|---|---|---|
| M1 | Versioned200+26 review items; source-linked133 exploratory questions;169 prior hashes verified | No human adjudication; low diversity; attempted reserve now exposed |
| M2 | Matched model/settings and real B1/frozen-corpus B2 observations | Database-backed B3/B4 and SQL blocked; no full superiority claim |
| M3 | Actual two-question extraction/gate ablation smoke and attribution | No full-cohort ablation or causal performance conclusion |
| M7 | Prior17 development cases and new24 provisional challenge | No independent held-out labels; PDF layouts unchecked; coverage/attribution tradeoff |
| M4/C7 | Versioned39-proposal fixed-pin isolated recovery/reconciliation | One-provider consistency only; production SQL extra assignment preserved |
| M5 | Post-fix invalid12/12, valid3/3, physical cleanup1/1 | Synthetic anchors/embeddings; staging differs from indexing; backups not erased |
| M6 | Controlled expectations15/16; interruption/resume evidence | Coherent stale view and silent omission not independently detectable; second RPC absent |
| Authorization | Saved distinct HTTP/tool/contract tests and signed-identity/least-privilege implementation reports | Deployment/key provisioning/live replay remain separate from local implementation |
''')
 write('FINAL_READINESS_REPORT.md',f'''# Readiness decision
**Exploratory/design-and-feasibility only. NO-GO for human-validated confirmatory AI claims.**

New benchmark attempts: B1 {s['b1_n']}/266; frozen-corpus B2 {s['b2_n']}/266. New database-backed B3/B4:0/532. The complete seven-condition, two-model plan would require1,862 benchmark attempts and has not been completed. Direct SQL is blocked. Original development smoke{s['development_smoke_n']}; new frozen-RAG smoke{s['frozen_rag_smoke_n']}. Gate challenge26 actual checks,24 unique source-valid cases; two source-only corrections retained with originals. Prior experiments were not rerun.

Nine adapter tests, nine analysis tests and one frozen-adapter mock/resume/scope test passed. Mock test outputs never enter measured results. Prior169 hashes match. No production code/data, chain state, credentials or historical results changed. Start-event accounting for interrupted in-flight development requests is incomplete; completed campaign keys are fully checked. All{s['exposed_questions']} attempted reserve items are marked exploratory-exposed in a separate ledger; original files remain intact.

Blockers: Docker/primary PostgreSQL unavailable due inaccessible stale analytics socket; normal restarts failed. Automatic approval blocked socket removal and no alternate deletion was attempted. Independent human review, independent RPC and manuscript source are unavailable. Whole-answer accuracy and independent entailment metrics remain unavailable. Completed counts above come from actual raw records.

Defensible manuscript content is in FINAL_SCIENTIFIC_TABLES.md and Q1_MANUSCRIPT_RESULTS_REVISION.md. Missing experiments must remain explicitly blocked; no four-way confirmatory comparison or Q1 acceptance guarantee is claimed.''')
 print(json.dumps({'reports_written':9,'benchmark_records':s['benchmark_records'],'human_annotations':0}))
if __name__=='__main__':main()
