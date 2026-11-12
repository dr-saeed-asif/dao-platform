# M7 field-aware claim verification

The original verifier in `app/business/agents/claims.py` pooled every number from the citations attached to a claim. It marked the claim supported when each number appeared anywhere in that pool. For evidence stating Equipment EUR 2,000 and Travel EUR 500, it accepted Equipment EUR 500. The separate citation check in `quality.py` verifies reference syntax and existence. The synthesis currency guard also pooled amounts without checking labels.

The corrected verifier requires a field, Decimal value and normalized currency or measurement unit to match a single explicit record from a source cited on the claim. It recognizes simple labeled rows, single-value sentences, a narrowly defined total-budget heading/value pair, and selected structured governance and budget fields. Matching and conflicting records carry the citation ID and evidence span in the additive `claim_checks` diagnostic. Conflicting field records, missing labels or units, and ambiguous layouts remain unchecked. Numeric absence and unknown citations retain their existing diagnostics. Recognized completeness claims remain unchecked because the retrieval pipeline supplies excerpts without an authoritative completeness assertion. The synthesis path withholds detected contradictions and recognized completeness claims and falls back to specialist findings. Existing citation IDs and response fields are retained. The legacy `valid` field still means no flagged violations, so consumers must inspect claim statuses to establish support.

| File | Change |
|---|---|
| `app/business/agents/claims.py` | Field-aware parsing, cited evidence association, completeness handling and diagnostics |
| `app/business/agents/synthesis.py` | Apply contradiction and completeness checks to generated sections |
| `tests/test_m7_claims.py` | Budget, units, missing values and labels, ambiguity, completeness, structured evidence and citation scope |
| `tests/test_agent_synthesis.py` | Regression for withholding a swapped amount with a structurally valid citation |
| `benchmark/m7/` | Versioned development data, evaluator and per-item results for both implementations |

## Validation

- Before the fix, `python -m unittest discover -s tests -p test_m7_claims.py` failed 9 of 17 subcases.
- After the fix, `python -m unittest discover -s tests` passed 271 tests, including claim, citation, synthesis and workflow regressions. The run used the repository virtual environment.
- `python -m compileall -q` passed on the changed Python files and evaluator. `git diff --check` passed. Ruff, Flake8, Pylint, mypy and Pyright were unavailable in the project environment and were not run.

## Development measurements

The dataset contains 17 synthetic, author-labelled regression cases used during implementation. No independent evaluation or human adjudication was performed. The baseline loads the previous verifier directly from Git commit `9c27c8a57dfe44abccc43f0cf509ca33e3e0ac79`. A positive prediction is the explicit `supported` status. Reject and abstain are separate in the five-category confusion matrix and both count as non-acceptance for binary metrics.

| Measure | Original | Field-aware |
|---|---:|---:|
| True positives | 3 | 3 |
| False positives | 9 | 0 |
| True negatives, including abstentions | 5 | 14 |
| False negatives | 0 | 0 |
| Precision | 3/12 | 3/3 |
| Recall | 3/3 | 3/3 |
| False-positive rate | 9/14 | 0/14 |
| False-negative rate | 0/3 | 0/3 |
| Abstention rate | 4/17 | 9/17 |

| Gold category | n | Accepted | Rejected | Abstained |
|---|---:|---:|---:|---:|
| Supported | 3 | 3 | 0 | 0 |
| Contradicted | 4 | 0 | 4 | 0 |
| Unsupported | 2 | 0 | 1 | 1 |
| Ambiguous | 3 | 0 | 0 | 3 |
| Completeness claim | 5 | 0 | 0 | 5 |

Reproduce from the repository root with `python benchmark/m7/evaluate.py benchmark/m7/development.json --baseline 9c27c8a57dfe44abccc43f0cf509ca33e3e0ac79`. Both matrices and per-case statuses are stored in `benchmark/m7/development-results.json`. Independently labelled data should be stored separately, carry reviewer and evidence provenance, and be evaluated through the same dataset interface without merging it with the development cases.

## Contribution 4 and manuscript wording

Describe Contribution 4 as separate structural citation validation and deterministic, field-aware numerical support checking. State that the regression fixtures demonstrate rejection of swapped amounts and currency or unit mismatches for supported record formats. Report the observed abstentions alongside false positives. Keep historical metrics tied to their original verifier version. The 17 development cases provide no estimate of production accuracy.

Parsing is deliberately limited. Multi-column PDF extraction, compound statements, unfamiliar units, temporal qualifiers, cross-proposal scope and arbitrary paraphrases can remain unchecked or be misinterpreted. The gate does not convert currencies or units, prove evidence completeness, assess document truth, or establish general semantic entailment. Unchecked numerical wording may still be displayed as part of synthesis and is excluded from supported-claim counts. No new model, benchmark campaign or blockchain experiment was executed.
