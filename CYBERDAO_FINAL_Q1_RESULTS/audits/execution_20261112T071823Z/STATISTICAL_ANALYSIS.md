# Exploratory statistics — fixed partial snapshot
Captured 2026-11-12T07:18:23+00:00; 1262/1,862 expected records. Every model/condition uses its actual saved denominator; planned cells remain133. Do not compare the partial4B B3 subset as if it were the full matched cohort. Failed attempts count as proxy nonmatches. Whole-answer correctness, independent claim support and unauthorized disclosure are not estimated.

| Model | Same-question pairs | Full minus RAG proxy (percentage points) | Four-scope bootstrap95% interval (pp) |
|---|---:|---:|---|
| qwen3:0.6b | 133 | -12.03 | [-16.81, 28.57] |

Reference matching is the existing frozen normalized-text/numeric-anchor or bounded-abstention-cue proxy, not semantic answer accuracy. CI:2,000 bootstrap resamples of four proposal scopes,seed110911; paired differences join identical question IDs, including failures. Only four clusters, shared facts, provisional AI-assisted references and fixed-seed outputs make these intervals unstable conditional descriptions, not population guarantees. No significance test is claimed. Missing4B Full prevents a4B RAG-versus-Full comparison.

Latency:median and nearest-rank p95 over all saved attempts, including failures. B2 generation timing excludes cached retrieval/setup; hardware residency, queueing and phases differ. Configured async deadlines are not absolute observed wall-time bounds; raw overruns are retained. Missing provider token reports are unknown, not zero cost. Claim-gate output and structural citation validity are automated diagnostics, not independent claim-level scoring. Structural validity can include uncited/empty responses; cited-answer counts are separate in CSVs.
