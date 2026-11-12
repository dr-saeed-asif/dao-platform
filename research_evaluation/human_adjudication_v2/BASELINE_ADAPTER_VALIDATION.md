# Baseline and ablation adapter validation

Nine offline mock/contract tests passed against the actual saved adapter source and current synthesis gate. Model and HTTP replies were mocked. Zero network or model inference calls occurred.

| Condition | Inspection and fixture result | Remaining requirement |
|---|---|---|
| B1 LLM only | Candidate builds no tools, omits tool schemas, sends question/scope without gold and fails an unexpected tool request | Common model/decoding and current evidence protocol must be frozen |
| B2 plain RAG | The requested adapter is absent. Historical B2 is a single tool agent | Implement and validate document retrieval and no-tool behavior |
| B3 tool agent | Candidate rejects cross-DAO and wrong direct proposal IDs before backend calls, preserves structured errors and allows comparison IDs for backend DAO validation | Full permitted-tool and membership parity, signed identity, source/evidence and generation settings remain unvalidated |
| B4 current full workflow | Controlled synthesis rejects a swapped field-value relation despite a valid citation | Full planner/retrieval/producer attribution and configuration parity remain unvalidated |
| A1 extractor disabled | No current research hook found | Cover all direct extractors including budget and module-local helpers, with identical retrieval |
| A2 claim gate disabled | No correct current hook found. Historical broad ablation leaves synthesis.blocking_flags active | Disable only the intended claim gate aliases and preserve structural/reference checks, restore hooks after every exit |
| A3 full pipeline | Same configuration as B4 if aliases are exact | Reuse the same observation rather than double counting |
| A4 direct SQL | No mapped current adapter found | Whitelisted authorized fields, source snapshot and explicit applicability are needed |

The historical B3 ablation temporarily disables structural references, currency safeguards and workflow.blocking_flags. It predates the synthesis-local M7 claim check and leaves that check active. The fixture verified this residual gate and verified restoration after an injected exception. It is therefore unsuitable for the new A2 definition. This task records the adapter defect and blocks campaign readiness without changing production behavior or historical scripts.

The same-DAO comparison test checks the candidate's local guard, while ownership enforcement remains a backend responsibility. These mocked checks do not establish wallet authorization or parity for all tools. Current C4 identity assertions and C5 credentials must be exercised in a separate isolated integration preflight.

Another check confirmed that an unchecked numeric association can return no blocking flag. Human claim evaluation must distinguish supported, rejected and unchecked coverage. A nonblocking result cannot be scored as supported by default.

The old candidate returns an output_origin value intended for real runs. Test results here are explicitly mock fixtures and must not be ingested as real model observations. The supplied adapter_validation.json labels scientific validation false for every condition until complete current-version and evidence checks are available.

Tests executed with the AI repository virtual environment:

```powershell
<AI virtualenv Python> -m unittest discover -s research_evaluation/human_adjudication_v2 -p test_adapters.py
```

adapter-tests.log records 9/9 passing checks. Tests cover the boundaries described above and confirm implementation gaps. They do not assert that all requested baseline/ablation adapters are implemented.
