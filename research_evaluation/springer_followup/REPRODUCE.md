# Reproduce the targeted follow-up

The original 39-proposal measurements remain in `../springer/`. This directory records seven affected proposal rechecks and one affected false-positive fixture using the source fix in `verifier_fix.patch`. The source revision is identified by the prior commit plus the working-tree diff and exact source/compiled hashes in `reconciliation_config.json`.

The regression command was run from `apps/api` using the existing Jest installation and the filter `maps finalized records`. It passed one new test and skipped ten unrelated tests. Its complete output is in `unit_finalized.txt`. The affected fixture returned verified in `fault_injection.json`.

The API had been rebuilt with `npm run build --workspace=api`. The affected proposal runner started the actual verifier/controller in an isolated loopback Nest instance and used read-only SQL. Its runtime assertion requires a verified Closed/Closed status comparison on the finalized proposal. The recorded source/compiled hashes match the rebuilt verifier. The assignment investigator used direct contract reads at the archived block, with network and block-hash checks. It exported only counts.

The scripts use exclusive or checkpointed output. The saved campaign is complete. A new measurement requires a fresh sibling directory under `research_evaluation/` containing the relevant scripts. The original pre-fix files must remain available under `springer/`. No database repair or chain transaction is part of these scripts.

For offline regeneration, run `python research_evaluation/springer_followup/analyze.py` from the DAO root with Matplotlib available. It reads the archived report and mapping copies before updating their current versions. It validates the seven saved records, the isolated runtime marker, source/compiled hashes, assignment counts, and regression result. `prepare_review.py` creates the reserved-case review template and pre-execution rubric without calling a model.

Before/post observations use different live chain blocks and observation times. Do not pool the seven rechecks with the archived 39 cases as a newly measured full cohort. Only one of the original six classifiable fault cases was retested. The remaining checkpoint and historical database limitations require additional evidence.
