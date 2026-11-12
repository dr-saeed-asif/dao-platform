# Statistical analysis status

The current task produced zero new inference observations, zero human-scored answers and zero human-adjudicated claims. No current answer accuracy, gate precision/recall, significance test or human agreement coefficient can be calculated.

AI_BASELINE_RESULTS.csv reproduces four archived 4B development-smoke resource rows. Each variant has two purposive development questions, with architecture-dependent prompts and failures. These describe previously measured latency and token consumption and carry their original source path. They are not the newly requested B1–B4 comparison. ABLATION_RESULTS.csv, CLAIM_VERIFICATION_RESULTS.csv and HUMAN_AGREEMENT_RESULTS.csv intentionally contain only headers.

## Prospective analysis

Use the first predeclared generation seed for primary binary whole-answer correctness. Preserve additional repeats as dependent observations for sensitivity and within-question variability. Report exact attempted, completed, failed, abstained, harness-invalid and human-scored denominators. Report accuracy among all intended eligible items, with separate missing-score counts rather than silently dropping failures.

Citation validity uses actual recognized identifiers and malformed-marker checks. Claim support requires human judgment at the atomic-claim level. Report supported-answer rate, unsupported-claim rate, abstention and claim-gate coverage separately. A partial automatic check cannot establish semantic support. Missing usage stays null and is excluded from token sums with a reported missingness denominator.

For paired conditions, resample questions while retaining all condition/repeat observations together. Pairwise binary McNemar tests are considered only after reviewing question dependence and discordant counts. Repeated questions over the same proposal/PDF share evidence and facts. A few proposal clusters do not support reliable inference to a new DAO population. Question-level bootstrap intervals describe conditional performance on the selected sources and must disclose this dependence. Report effect sizes, intervals, paired sample counts and multiplicity handling before examining outcomes.

Use Wilson intervals descriptively for proportions when their sampling interpretation is stated. For claim-gate evaluation, define supported as the positive gold label, reject and abstain as separate predictions, and provide a confusion matrix. Report precision, recall, false-positive and false-negative rates, abstention and classification coverage with exact denominators. Include ambiguous claims separately. Do not treat every abstention as a correct rejection without defining that binary convention.

Two expert submissions enable nominal agreement analyses for validity, answerability, ambiguity and decision. Percent agreement and Cohen's kappa must use matched complete pairs, with missing and unresolved counts. The supplied assess_reviews.py returns pending/null when the templates are empty. It records attestation, while reviewer independence still requires coordinator verification.

The existing benchmark/stats.py implements Wilson, exact McNemar and paired bootstrap helpers. Its existing benchmark regression suite passed 27 tests in this task. No scientific p-value was produced from those software fixtures.
