# Citation support error analysis

Reference validity and amount presence do not establish the relationship between an amount and its budget category. Four contradicted claims occurred in two answers to MS-002. These annotations are AI-assisted, source-linked and pending human review.

| Variant | EUR | Generated category | Category in returned D1 | Verification at runtime |
|---|---:|---|---|---|
| B3 | 6,000 | Governance dashboard improvements | Independent security review | Disabled by ablation |
| B3 | 3,000 | AI evaluation | Governance dashboard improvements | Disabled by ablation |
| B4 | 6,000 | Governance dashboard improvements | Independent security review | Active; accepted |
| B4 | 3,000 | AI evaluation | Governance dashboard improvements | Active; accepted |

B4 is raw line 9 and B3 raw line 11 of `../exploratory_frozen_v2/responses.jsonl`. D1 content SHA-256 is `39798d9ba93fdf3a18726774923eb0e094a5e2e0bc39cd1709dc12e7ce9eda9a`. [Machine-readable annotations](budget_claim_errors.json)

All four claims satisfy the replayed reference-ID and currency-presence predicates. Only the two B4 claims passed an active runtime gate. Describing all four as active verification failures would misrepresent the B3 ablation. In AI source `quality.py:14` the reference validator checks citation IDs, and `synthesis.py:81` checks amount presence in the cited context. These checks do not validate budget-category/amount alignment. The model generated the wrong relation even though the necessary source rows were returned, so these cases are generation failures plus a semantic coverage gap in verification, not missing-source retrieval failures.

The existing structural reference counts, B3 16/16 and B4 17/17 valid IDs, remain unchanged. They are reference-ID denominators, not supported-claim denominators. The prior diagnostic sample has 18 assertions: ten supported, four contradicted by returned sources and four unsupported without cited source evidence. Eight are contradicted against authoritative facts when the unsupported group is also checked. This selected, non-exhaustive annotation sample cannot estimate population factual support. Preserve the existing annotation file and obtain blinded human adjudication before using it as a validated claim-level accuracy result.

A targeted future validator test should keep an amount present while swapping its category, include genuine unsupported claims and preserve explicit unknowns. No existing answer should be repaired or removed from the experimental record. Structural repair success and factual-support repair must be reported separately.
