"""Publish history and exploratory metrics from saved evidence only."""
import csv
import hashlib
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
HISTORY=ROOT/'springer_history'

def read(path):return json.loads(path.read_text(encoding='utf8'))

def main():
    summary=read(HERE/'summary.json');scope=read(HERE/'analysis_manifest.json')
    history=read(HISTORY/'assignment_history.json');receipt=read(HISTORY/'failed_assignment_receipt.json')
    assert history['event_counts']=={'MemberAssigned':9,'MemberUnassigned':0}
    assert history['reconstructed_assigned_members']==history['contract_assigned_count']==9
    failed=receipt['failed_references'];assert len(failed)==1
    assert all(failed[0][k] for k in ['canonical_receipt_block','receipt_before_pin','targets_configured_contract','decoded_proposal_matches','active_sql_member_in_transaction'])
    assert failed[0]['receipt_status']=='0x0' and failed[0]['decoded_method']=='assignMembers'
    post=[json.loads(s) for s in (ROOT/'springer_followup/reconciliation.jsonl').read_text(encoding='utf8').splitlines()]
    with (HISTORY/'unverified_winner_tie.csv').open('w',newline='',encoding='utf8') as f:
        w=csv.writer(f);w.writerow(['on_chain_id','block','field','database','blockchain','status'])
        for r in post:
            if r['status']=='unverified':
                for c in r['scalar_findings']:
                    if c['field'] in ['winning_option','tied']:w.writerow([r['on_chain_id'],r['block'],c['field'],c['database'],c['blockchain'],c['status']])
    table=[]
    for v,s in summary.items():
        counts=s['whole_answer_AI_counts'];refs=f"{s['valid_reference_ids']}/{s['reference_ids']}" if s['reference_ids'] else '—'
        table.append(f"| {v} | {counts.get('correct',0)}/8 | {counts.get('incorrect',0)} | {counts.get('unanswered',0)} | {s['median_wall_ms']/1000:.3f} | {refs} |")
    text='''# Historical assignment investigation and frozen-evidence exploratory comparison

## New reconciliation finding

The complete creation-to-pin membership scan covered 931 ranges from block 19347494 through the saved block 20277566. It returned nine MemberAssigned events and zero MemberUnassigned events. Reconstructing the assigned set gave nine members, agreeing with the pinned contract counter. One active SQL row had no matching canonical membership event, no latest evidence link, and a false contract membership flag.

That row's transaction reference resolves to a canonical **failed assignMembers call**, with receipt status 0x0 at block 19347983 and zero receipt logs. Decoding the transaction confirms the configured contract, proposal 32 and the SQL-listed member in its argument list. Thus the extra SQL row points to an assignment attempt that reverted. The SQL active flag includes an operational row without a successful canonical assignment, while the contract counts successful assignments. The difference is an unconfirmed or inconsistent canonical projection for that row. The application/import path and whether it intentionally preserved assignment intent remain unresolved. No unassignment event explains a stale removal, and duplicate SQL rows do not explain the count. Historical SQL row versions and indexer checkpoints remain unavailable. This is not evidence of a blockchain fault.

The prior FINALIZED-to-Closed fix and its passing regression remain preserved. The six recorded unverified cases are documented in `springer_history/unverified_winner_tie.csv`: each lacks SQL winning-option and tie values. Those absence records remain distinct from a detected false value. No governance records were changed to force agreement.

## Exploratory comparison and exact denominators

Eight eligible questions were selected before generation, with two each from DB, PDF, multi-source and PDF-bounded unknown categories. They cover two demo proposals. The existing B1–B4 implementations were reused, with recorded provider options, fixed model digests and the corrected verifier hash. All SQL tools imported a shared read-only MVCC snapshot, including document-index state. The corrected verifier captured chain observations against that SQL snapshot, and tool-equipped variants replayed identical sanitized chain reports.

Chat and planning used **qwen3:0.6b**, with qwen3-embedding:0.6b embeddings. B1/B2 used seed 42, temperature 0.6, context 8192 and a 1536-token output cap. Existing planner and workflow retry limits remained in force and are recorded in provider calls. The comparison therefore includes unequal stage/retry budgets and only this small-model configuration.

There are **50 preserved raw attempts**. Eighteen initial attempts were invalidated by two research-harness defects: a missing pool timeout parameter and incorrect dataclass conversion. Fourteen unaffected records were retained. Only the 18 affected pairs were rerun after real-tool preflight checks. The resulting comparison has **32 records, eight per variant**. Full-table source fingerprints match between campaigns and the chain snapshot bytes are identical. Invalid attempts remain available with exclusion reasons and are not counted as model failures.

The following whole-answer assessments are **post-hoc AI-assisted judgments by the same research assistant**, with human adjudication pending. Safe declines on bounded unknowns count as correct; a technical fallback is unanswered. Citation grounding is scored separately. All selected outer requests completed, but eight final answers were technically unavailable. Nine final responses had mixed/fallback origins, including one useful correct budget answer.

| Variant | AI-rated correct | Incorrect | Unanswered | Median wall s | Structurally valid citation IDs |
|---|---:|---:|---:|---:|---:|
'''+ '\n'.join(table)+'''

The two B1/B2 correct answers per variant are safe declines on bounded unknowns, not recovery of the requested positive governance facts. B4's one correct answer is a cited security-allocation fallback. Both full workflows mislabelled budget allocations in a multi-source answer and failed to return requested governance counts. These observations cannot establish a general model ranking. Planner/retry budgets differ across baseline implementations, and cache state and campaign times were uncontrolled.

The purposive diagnostic claim sample contains **18 assertions**: ten supported, four contradicted and four unsupported by returned evidence. The eight bad assertions are contradicted by authoritative source values. Four are local UUIDs substituted for numeric on-chain IDs; four swap budget labels despite valid source identifiers and amounts. This sample is intentionally diagnostic, not an exhaustive or random claim sample. No population support-rate estimate is justified. All written B3/B4 reference IDs resolve, yet this does not ensure semantic support. Source-linked annotations and automatic numeric/reference checks are saved separately.

All four B1/B2 bounded-unknown responses declined to invent the missing value. B3/B4 instead returned four technical-unavailability fallbacks on those cases. Answerable cases with false abstention are recorded individually. Appropriate abstention, factual correctness, technical failure and citation grounding must remain separate metrics.

Inference is limited by eight purposive cases, two related source clusters, one observation per pair and same-assistant scoring. No confirmatory p-values or population confidence intervals are reported. Human-validated whole-answer correctness and claim entailment remain pending.

## Exposure and next gates

The original 141-question v3 files are preserved. These eight questions are now exposed, including the invalid initial attempts. The updated ledger leaves **133 reserved questions**. A subsequent confirmatory campaign must apply this ledger, freeze its evidence, adjudicate the scoring and review outstanding revisions. No confirmatory or human-validated result is asserted here.

The failed assignment reference provides a concrete target for a separate write-path investigation. Reproducing the historical SQL insertion would require audit logs or an isolated replay of the relevant application/import path. The known status fix remains the only production logic modification.
'''
    (HERE/'EXPLORATORY_RESULTS.md').write_text(text,encoding='utf8')
    before=(HISTORY/'SPRINGER_BEFORE_HISTORY.md').read_text(encoding='utf8')
    header='''# Latest historical and exploratory evidence

Historical membership reconstruction found nine assignment events and no unassignments. The extra active SQL row references a reverted assignMembers transaction for that same member and proposal. The SQL writer/import path remains unresolved. The six post-fix unverified records still lack winner/tie data.

A frozen-evidence exploratory comparison now contains 32 usable observations on eight questions. Fifty raw attempts were retained, including 18 harness-invalid attempts and their affected retests. Whole-answer correct counts were B1 2/8, B2 2/8, B3 0/8 and B4 1/8 under explicit same-assistant, post-hoc AI ratings. Independent human adjudication remains pending. The new exposure ledger leaves 133 reserved candidates.

See the [new results](exploratory_frozen_v2/EXPLORATORY_RESULTS.md), [comparison table](exploratory_frozen_v2/baseline_comparison.csv), [figure](exploratory_frozen_v2/baseline_outcomes.svg), [history record](springer_history/assignment_history.json) and [failed receipt provenance](springer_history/failed_assignment_receipt.json).

---

## Preserved earlier study accounts

'''
    (ROOT/'SPRINGER_EXPERIMENTAL_RESULTS.md').write_text(header+before,encoding='utf8')
    mapping=(HISTORY/'CLAIMS_BEFORE_HISTORY.md').read_text(encoding='utf8')
    mapping+='''
## Latest evidence additions

| Claim | Evidence status |
|---|---|
| SQL-only active assignment has canonical assignment support | Contradicted for the investigated row. No MemberAssigned event through the pin, contract membership false, and its referenced assignMembers transaction reverted. The row creation path remains unresolved. |
| Whole-answer superiority of the full workflow | Unsupported by the new exploratory eight-case comparison. Same-assistant correct counts are 2/8, 2/8, 0/8 and 1/8 for B1–B4. Human validation is pending. |
| Valid citations guarantee claim support | Contradicted by four wrong budget-label assertions that cite real source IDs and use source-present amounts. |
| Consistent evidence across the new baseline comparison | Supported by shared/imported SQL snapshots, matching full-public-table fingerprints for the affected retest and byte-identical corrected-verifier chain replay. Temporal SQL-at-chain-block reconstruction remains unavailable. |

[Source-linked new results](../exploratory_frozen_v2/EXPLORATORY_RESULTS.md)
'''
    (ROOT/'springer/EVIDENCE_TO_CLAIMS.md').write_text(mapping,encoding='utf8')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.size':9,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False})
    fig,(a,b)=plt.subplots(1,2,figsize=(7.5,3.1),layout='constrained')
    variants=list(summary);bottom=[0]*4
    for state,color in [('correct','#396a93'),('incorrect','#a34c37'),('unanswered','#b18d39')]:
        counts=[summary[v]['whole_answer_AI_counts'].get(state,0) for v in variants]
        a.bar(variants,counts,bottom=bottom,color=color,label=state.capitalize())
        bottom=[x+y for x,y in zip(bottom,counts)]
    a.set(ylim=(0,10),yticks=[0,2,4,6,8],ylabel='Cases per variant',title='Post-hoc AI whole-answer ratings')
    a.legend(frameon=False,fontsize=8,loc='upper center',bbox_to_anchor=(.5,-.13),ncol=3)
    scores=read(HERE/'scores.json')
    for i,v in enumerate(variants):
        group=[r for r in scores if r['variant']==v]
        b.scatter([i+(j-3.5)*.04 for j in range(len(group))],[r['wall_ms']/1000 for r in group],s=18,color='#396a93')
    b.set(xticks=range(4),xticklabels=variants,ylabel='In-process wall time (s)',title='32 selected observations')
    b.grid(axis='y',alpha=.2)
    fig.suptitle('Exploratory eight-case comparison; human adjudication pending',fontsize=10)
    fig.savefig(HERE/'baseline_outcomes.svg',bbox_inches='tight');fig.savefig(HERE/'baseline_outcomes.png',dpi=300,bbox_inches='tight');plt.close(fig)
    print('Updated manuscript evidence, tables and figure from preserved observations.')

if __name__=='__main__':main()
