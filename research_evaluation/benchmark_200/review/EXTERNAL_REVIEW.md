# Independent review required

No independent reviewer has approved or rejected these items. All existing computational checks and diagnostic source inspections were performed by the same research assistant. A second SQL query or another script is a source cross-check, not an independent ground-truth judgment.

The 25 originals were quarantined because the original verifier checked only absence of an exact phrase. This does not establish that a paraphrased answer is unavailable. `quarantine_25.json` records the requested fact, original expectation, specific source boundaries and disposition for every item. There was no failed human adjudication to overturn.

`replacement_candidates_25.json` proposes 25 narrower PDF-bounded questions with exact negative-evidence quotations and page/hash references. They ask for a value or event that the PDF explicitly does not establish. They reject unsupported premises; reviewers must decide whether they belong in the unanswerable category. None has been silently admitted. `proposed_benchmark_v2.json` and `proposed_gold_v2.json` are an unreleased replacement draft, separate from the frozen benchmark and experimental prompts.

The 175-item source audit found no mismatch in direct field values, quoted anchors or recomputed operands. This does not verify complete semantics. Ten multi-source questions have awkward wording that combines a stored on-chain proposal identifier with an on-chain option count. The complex category mainly measures arithmetic and evidence-boundary reasoning; its difficulty labels and construct coverage need review. The 25 unauthorized questions share one missing-wallet boundary, and their HTTP status records cannot establish response-body non-disclosure. All 292 lexical near-duplicate flags need semantic adjudication; a flagged pair is not a confirmed duplicate. Related questions over shared evidence remain statistically dependent.

The literal context audit also flags **DB-021**: the cleanup title equals its DAO identifier, which the baseline receives as scope context. It has not been executed. `replacement_leaked_title.json` proposes a database voting-window calculation instead. The reviewer draft uses DB-R021, while the frozen original is retained and blocked from future admission pending revision. The historical/proposed adjudication sheet therefore has 226 rows (200 originals, 25 UN replacements and this additional DB replacement). The 200-item blind draft contains all 26 proposed substitutions. These source checks are still not independent approval.

## Review procedure

1. Recruit reviewers who did not author this benchmark or see its model outputs. Prefer two governance/document experts. Record anonymous reviewer IDs and their relationship to the study.
2. Give each reviewer `blind_review_sheet.csv`, the sanitized snapshot and original PDFs. Do not provide proposed gold or system responses during the first pass. Reviewers derive expected answers and exact supporting evidence independently, decide answerability, flag ambiguity/duplicates/leakage, and accept/revise/reject each item.
3. Compare the independent derivations with `proposed_gold_v2.json` and the gold-bearing `external_review_sheet.csv` only during adjudication. Resolve disagreements with documented rationale and a third reviewer when needed. Preserve all annotations and revisions; never treat blank review fields as approval.
4. Freeze a final 200-item version only after category counts, semantic uniqueness, source support and eligibility have passed. Keep unsupported, ambiguous and non-adjudicated items out of the final benchmark. Report agreement using a predeclared rubric; do not manufacture agreement from script outputs.
5. Separate development questions from confirmatory held-out questions. Existing smoke and source-count questions have been exposed to the system. Demo-source overlap and repeated atomic facts limit generalization even if all 200 question texts differ.

The research runner continues to block full evaluation. The new eight-question count subset is explicitly nonconfirmatory and source-checked only. Its outputs cannot substitute for independent benchmark validation. The unchanged production implementation may legitimately perform poorly; errors must remain in the evaluation and must not become an accuracy-based exclusion rule.

To reproduce the source audit without generation run `scripts/review_saved.py`, `scripts/prepare_external.py` and `scripts/diagnose_b2.py` from the documented environment. Their outputs are reviewer materials and same-assistant checks only.
