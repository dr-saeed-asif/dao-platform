# Failure analysis and execution status

## Preserved historical findings

The earlier frozen comparison retained 50 attempts. Eighteen were initially harness-invalid, with sixteen pool-interface errors and two recorder/dataclass errors. Fourteen usable initial attempts and eighteen affected retries formed 32 usable observations, eight per variant. All raw failures and retries remain in their versioned directories. Post-hoc AI-assisted whole-answer ratings were B1 2/8 correct, B2 2/8, B3 0/8 and B4 1/8. The design had decoding, protocol and retry differences, so these ratings cannot establish an architectural advantage.

Among sixteen full-workflow observations, eight had routing-coverage failures and eight synthesis-framing failures with overlap. Retrieval operations completing did not establish retrieval recall. Four incorrect budget-label statements passed structural reference checks, including two B4 findings that remain preserved. The M7 implementation now checks selected field-value-unit relationships, but its synthetic development tests supply no independent end-to-end accuracy result.

The archived two-question 4B smoke retained eight observations plus a separate B2 follow-up. The initial B2 mixed-source run exhausted its tool loop. Later research adapters improved error transparency and scoped comparison access, while the separate retest still omitted a requested PDF allocation. That retest is not substituted into the original table. The original four title smoke attempts in a different benchmark run were excluded for leaked caller scope, with explicit records.

The present M5 correction adds current-file integrity checks and AI-index invalidation. Frozen older SQL/model harnesses were prepared before this behavior and C4/C5 runtime enforcement. They need current-version parity checks. A shared service token with an operator header must not replace signed identity assertions in a new HTTP benchmark.

## Taxonomy required for the next actual campaign

Record incorrect retrieval, missing evidence, extractor errors, hallucinated numbers, citation syntax/reference errors, unsupported claims, routing errors, synthesis framing, model limitations, timeouts, gate rejection and fallback errors at the attempt and claim levels. Preserve multiple labels when failures overlap. Distinguish a model answer from deterministic extraction and verbatim fallback using actual execution spans. Do not infer an answer producer from the presence of an LLM trace elsewhere in the request.

## New observations

This task made no model inference or unauthorized application request. It checked the saved benchmark/exposure records, polled model metadata and ran the existing deterministic benchmark-harness suite. All 27 harness tests passed. Human adjudication and frozen-evidence prerequisites remain unmet, so there are no new answer failures or improvements to score. Prior production-security fixes and historical measurements retain their original versions.


## Archived diagnostic table

These counts describe the 16 usable full-workflow observations in the earlier frozen regime. Categories overlap.

| Failure or diagnostic | Observations |
|---|---:|
| Routing or required-source coverage failure | 8/16 |
| Missing required TASK header | 8/16 |
| Citation gate rejected synthesis | 1/16 |
| Incorrect budget-label answer | 2/16 |
| Off-target DAO proposal count | 2/16 |
| Retrieval operation error | 0/16 |
| HTTP or empty-provider-output failure | 0/16 |

Source references are research_evaluation/failure_diagnosis/FAILURE_ANALYSIS.md and its item-level taxonomy files. The zero retrieval-operation-error row measures execution success and leaves recall and relevance unmeasured.
