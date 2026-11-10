"""Report the saved continuation audit and new source-checked subset separately."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    s=json.loads((ROOT/'metrics/subset_summary.json').read_text(encoding='utf8'))
    audit=json.loads((ROOT/'review/audit_summary.json').read_text(encoding='utf8'))
    rows=[];intervals=[]
    for v,r in s.items():
        refs=f'{r["valid_reference_ids"]}/{r["reference_ids"]}' if r['reference_ids'] else '—'
        rows.append(f'| {v} | {r["requested_count_proxy_hits"]}/{r["attempts"]} | {r["mixed_certainty_flags"]} | {r["median_wall_ms"]/1000:.3f} | {refs} | {r["median_input_tokens"]} / {r["median_output_tokens"]} |')
        c=r['conditional_cluster_bootstrap95'];intervals.append(f'| {v} | {c["low"]*100:.1f}–{c["high"]*100:.1f}% |')
    text='''## Continuation results and current validation status

The frozen 200-question benchmark and all previous smoke responses remain unchanged. **175 items passed the available value/anchor source checks; zero items have independent ground-truth adjudication.** This does not mean 175 clean benchmark questions: semantic wording, duplication and leakage require separate decisions. The original 25 absence questions remain quarantined. An unreleased 200-item draft substitutes 25 narrower, quote-anchored candidates and one newly identified leaking title question for external review; it is not used as validated gold.

### Review of all 200 original items

- Every quarantined item now has a specific record in [quarantine_25.json](review/quarantine_25.json), including its requested fact, original expectation and relevant source boundaries. None was rejected by an independent reviewer: no independent review existed. Its original exact-phrase absence test was insufficient. A lack of a value in the limited export cannot establish that it is universally unknown or absent from other authoritative records.
- [item_source_audit.json](review/item_source_audit.json) checks all 175 source-checked items. Direct SQL fields, quoted PDF anchors and recomputed operands match saved expectations. This is an automated same-assistant source audit, not semantic approval. The authorization checks establish saved 401 statuses; they do not independently establish response-body non-disclosure or upstream non-invocation.
- Ten multi-source wordings combine a stored proposal identifier and a chain option count ambiguously. All 292 high-overlap lexical pairs are flagged for semantic review rather than automatically accepted or called duplicates. Many source facts are reused. Complexity/difficulty labels and the predominance of arithmetic need construct review.
- The current-context literal audit identifies **DB-021**: its expected title is identical to the DAO identifier given to the baseline. It has not been executed in these campaigns. A separate [replacement proposal](review/replacement_leaked_title.json) asks for a timestamp-derived database voting-window duration. It is used only in the unreleased reviewer draft. Other literal full-answer checks do not establish absence of semantic leakage.
- [replacement_candidates_25.json](review/replacement_candidates_25.json) contains exact negative-evidence quotes and PDF page/hash references. These narrow questions to what the PDF establishes. Some reject false premises, so category validity also requires adjudication. They were not silently admitted or sent to a model.
- [EXTERNAL_REVIEW.md](review/EXTERNAL_REVIEW.md) describes two-stage blind derivation and adjudication. A 200-item [blind sheet](review/blind_review_sheet.csv), a 226-row historical/proposed adjudication sheet and separate proposed questions/gold are ready. No reviewer IDs, agreement scores or approval decisions have been invented.

### B2 diagnosis from existing saved trials

The three eligible old B2 answers exactly match their final provider content, so no extraction loss explains 0/3. All 22 existing tools were exposed. Successful document-metadata, governance and chain reads show that access was available. No recorded permission-guard rejection explains the score. Seed 42, temperature 0.6, context 8192 and output cap 1536 were actually supplied. These observations do not establish that model size or tool-list length caused the errors.

The PDF question made no tool call and incorrectly asserted that PDF retrieval was unavailable. The multi-source question fabricated an evidence identifier, omitted the required `chunk_key`, and then answered without searching PDF evidence. The status question chose vote facts rather than the proposal/status tool and invented a raw status. The model did not invoke `search_proposal_evidence` in any of the three. [b2_diagnosis.json](review/b2_diagnosis.json) includes exact schemas, tool events and option records. No old result was changed and no smoke trial was repeated.

All four excluded title attempts have been [audited](review/excluded_attempts.json). Their original model-visible scope label contained the exact gold title. The exclusion applies to every variant, including failed/fallback/incorrect and matching answers, irrespective of outcome. It was identified after execution, is explicitly documented as such, and all raw rows remain saved. Other wrong answers remain in their denominators.

### New experiment permitted under the validation restriction

Eight previously unrun direct-record questions were selected before new generation: indexed vote count and active assignment count for each of the four captured proposals. This selection uses unambiguous integer source fields, without the multi-source or unanswerable cases. Pre/post read-only SQL checks confirm that these count fields match the frozen snapshot. This is a **nonconfirmatory source-checked diagnostic subset, not an independently validated benchmark**. There were 32 new attempts, eight per variant, with unique IDs and resumable checkpoints. All completed, with real model/provider responses preserved; there were no new outer failures or fallback-labelled final answers. Prior smoke and new subset results are not pooled as one accuracy estimate.

This deliberately narrow count subset is easier than the full category mix and cannot substitute for it. The expected source counts and selected IDs were fixed before generation; the lexical scorer and wording diagnostics were implemented after inspecting saved responses. The analysis is exploratory and not preregistered. Incorrect, off-target and internally mixed responses remain in their denominators.

| Variant | Requested-count proxy hits | Mixed-certainty wording flags | Median wall s | Valid reference IDs | Median all-chat input/output tokens |
|---|---:|---:|---:|---:|---:|
'''+ '\n'.join(rows)+'''

The proxy detects the requested numeric count in context. It is **not whole-answer accuracy or claim support**. In B3/B4, three zero-vote answers also begin with “The available evidence does not establish that,” despite reporting the known database zero. B4 additionally splits the training scope marker into an extra question and includes an unrelated abstention. The automatic mixed-certainty flags are diagnostics, not independently adjudicated contradictions. One of B2's two matching counts has no returned source, illustrating the difference between a correct-looking number and verified grounding. Valid citation IDs do not resolve these answer-quality problems.

Four of the eight expected counts are zero; this narrow source pool has an imbalanced answer distribution. B1's low count coverage does not by itself make its uncertainty statements incorrect or unsafe. Returned-record accuracy, grounding, appropriate uncertainty and completeness need separate semantic ratings.

Automatic claim flags, retrieved excerpts, provider token counts, warnings and unsuccessful tool events remain in [subset_scores.json](metrics/subset_scores.json) and the [32 raw records](raw_results/source-counts-v1/responses.jsonl). Claim entailment, unauthorized response-body disclosure and semantic abstention correctness remain unmeasured by independent reviewers. These eight questions are answerable: abstention-wording counts are not unanswerable-case accuracy.

### Denominators and uncertainty

There are **52 saved attempts overall**: 20 historical smoke attempts (four contaminated exclusions) plus 32 new subset attempts. That leaves 44 eligible answer attempts across the two separate development studies, plus four historical HTTP denial attempts. The new subset denominator is 8 per variant; the old factual smoke denominator remains 3 per variant. There are still zero full-200 campaign outputs. The four historical HTTP denials involve no model and are not included in answer accuracy.

The eligible new subset contains two related questions per proposal. The following 95% intervals are **exploratory conditional proposal-cluster bootstrap resampling intervals** for the numeric proxy, not population or stochastic-generation confidence intervals. They resample the four observed proposal clusters 5,000 times, seed 42, averaging both questions within each cluster. With only four purposively selected sources, intervals can be unstable or degenerate; [subset_summary.json](metrics/subset_summary.json) leaves inferential population accuracy intervals null.

| Variant | Conditional cluster resampling interval |
|---|---:|
'''+ '\n'.join(intervals)+'''

Paired comparisons retain all eight matching IDs. B4-only count matches are 8 versus B1, 6 versus B2 and 0 versus B3. [subset_paired.json](metrics/subset_paired.json) contains conditional cluster intervals for matched proxy and latency differences. No significance p-values are reported. No independent whole-answer or semantic claim-support rate is reported. Equal numeric coverage by B3/B4 does not demonstrate the benefit or lack of benefit of citation verification.

### Current blockers and saved outputs

Full 200 × 4 evaluation remains blocked by independent semantic gold validation, ambiguity/deduplication adjudication and category/holdout approval. It is not blocked or censored merely because model answers are wrong. The draft replacement version is prepared for reviewers; blank review fields never count as acceptance. The original sources still cover only four demo proposals, with overlap in earlier studies. Production functionality has not been changed.

The new [CSV table](tables/source_counts_subset.csv), [figure](figures/source_counts_subset.svg), reviewer pack, configuration, provider traces and bootstrap calculations are reproducible from saved data. The exact selected IDs and the no-independent-review label are in [eligible_subset.json](review/eligible_subset.json). The previous final report and provenance manifest are archived. No complete 200-question journal claim is justified by this continuation.
'''
    (ROOT/'CONTINUATION_RESULTS.md').write_text(text,encoding='utf8')

if __name__=='__main__':main()
