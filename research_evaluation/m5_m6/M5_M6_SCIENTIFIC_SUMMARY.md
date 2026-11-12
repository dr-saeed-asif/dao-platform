# M5 and M6 scientific evidence summary

| Experiment | Completed execution | Main observed result |
|---|---|---|
| M5 document suite | 15 synthetic documents/attacks through real service, storage, parser and isolated SQL | Nest false acceptance 2/12 invalid cases; effective indexed-evidence false acceptance 1/12 |
| M5 unchanged controls | Three controls | 3/3 admitted with no false rejection |
| M5 stale-index behavior | One replacement and invalidation sequence | Stale chunk was readable before FAILED status; blocked afterward; physical deletion 0/1 |
| M6 service fault suite | 16 cases with mocked RPC/SQL inputs to actual compiled C7 | 15/16 classification matches; one coherent stale-provider acceptance |
| M6 recovery reliability | Four recorded observations with real isolated SQL and injected event inputs | Cursor/resume and duplicate checks passed; omission could advance scan progress |
| Independent endpoint comparison | Not executed | Second independently operated endpoint unavailable |

No observations were independently verified across RPC providers in these experiments. The chain-anchor evidence for M5 was synthetic. Embedding vectors were synthetic and the parser/SQL operations were real. The fixture labels were author-created development expectations without independent human adjudication. The original live 39/39 recovery result remains separately versioned in recovery_completeness.

## Manuscript-ready methods

A purposive 15-case document suite exercised content-addressed staging, stored-manifest validation, linked PDF synchronization, indexing and chunk retrieval using generated PDF files. ProposalCreated anchors were synthetic records in isolated PostgreSQL. Deterministic vectors replaced the embedding service. Rejection was recorded separately at staging/linking and at parsing/indexed-evidence access. A 16-case RPC suite applied controlled responses to the compiled verifier with SQL fixtures. Recovery interruption and duplicate behavior were evaluated separately against PostgreSQL using injected event envelopes. All original and unsuccessful attempts were retained, and one inconsistent harness case was explicitly replaced.

## RQ2 and contribution implications

RQ2 is supported within tested implementation boundaries by detection of byte, manifest and scope mismatches and by explicit uncertainty outcomes for many RPC faults. The results constrain the chain-anchored admission contribution because direct upload can index unlinked content and stale evidence can remain readable until status invalidation. Report valid-reference checks, byte integrity, anchor trust and retrievability as distinct properties.

The threat model must cover trusted SQL/indexer state, storage replacement after indexing, service-token access to direct upload, coherent stale providers and silent log omission. Discussion should report the malformed-PDF stage acceptance and stale-index exposure as measured limitations. Conclusions can state which selected controls rejected inputs and preserved uncertainty. They cannot claim universal chain-only indexing, automatic stale-chunk deletion, independent blockchain verification, population attack-detection performance, human-adjudicated labels or cryptographic proof of blockchain integrity from SQL/RPC agreement.

Table A is in m5/TABLE_A.csv and the M5 report. Table B is in m6/M6_RPC_FAULT_RESULTS.csv and the M6 report. Table C is absent because independence was not measured. No production fix was mixed into the frozen experiments.

## Commands executed

- `node research_evaluation/m5_m6/m5/run.cjs`
- `<AI virtual-environment Python> research_evaluation/m5_m6/m5/index_cases.py`
- `node research_evaluation/m5_m6/m5/after-index.cjs`
- `<AI virtual-environment Python> research_evaluation/m5_m6/m5/after_index.py`
- `node research_evaluation/m5_m6/m6/run.cjs`
- `node research_evaluation/m5_m6/m6/run.cjs out-of-order`
- `node research_evaluation/m5_m6/m6/reliability.cjs research_evaluation/m5_m6/m6`
- `<AI virtual-environment Python> -m unittest discover -s tests -p test_governance_*.py` from AI repository: 13 passed.
- `<AI virtual-environment Python> research_evaluation/m5_m6/analyze.py`

Exact source revisions, dirty state, configuration, dependency versions, SQL fixture identity and artifact hashes are in the reproducibility manifest. M6 absolute per-trial start timestamps were not captured by the initial harness. Duration and artifact creation/write timestamps are retained.

Per-case NestJS admission latency was measured. The Python indexing harness did not persist its per-case duration, so that CSV column remains empty. M6 service latencies are measured fixture execution times.
