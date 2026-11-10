# Evidence-to-claim mapping

| Contribution or claim | Status | Manuscript wording or limitation |
|---|---|---|
| A read-only verifier reconciles scoped indexed and chain data | Supported on the observed cohort | The rebuilt verifier returned 23 verified, 7 mismatched and 9 unverified results over 39 proposals. Each request pinned a chain block. |
| Verifier can detect selected injected faults | Supported in controlled fixtures | Detected the altered vote total, genuine status divergence, missing RPC event and simulated block hash change. |
| Verifier has reliable status normalization and checkpoint diagnosis | Unsupported by current results | The finalized-state fixture produced a false mismatch. Chain-only events remained unverified at row level and produced aggregate mismatches in the two index completeness fixtures. |
| Assignment data were corrupted | Pending causal diagnosis | One stored assignment count differed from the chain. Historical index state and cause are unknown. |
| Citation validation establishes factual support | Unsupported | A reference can be structurally valid while attached to a wrong-field number or unsupported prose. |
| Tool guards deny the tested unauthorized invocations | Supported in isolated probes | Four expected denials across unavailable tools, role restrictions and missing operator authorization. |
| Free-text injection resistance or comprehensive non-disclosure | Pending | Tool probes were simulated. The saved error bodies provide only route-specific observations. |
| Full orchestration improves whole-answer accuracy over matched baselines | Pending | The prior count subset measured a lexical proxy. No confirmatory comparison or independent human adjudication is available. |
| 200-question human-validated benchmark | Pending | Claude audit plus exposure filtering leaves 141 content-eligible items and zero human-adjudicated items. |
