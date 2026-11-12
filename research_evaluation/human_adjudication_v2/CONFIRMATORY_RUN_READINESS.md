# Confirmatory run readiness

**NO-GO.** The current annotation imports contain no complete human review pairs. All 133 reserved candidates await an explicit reviewed disposition. The accepted, frozen confirmatory cohort has size zero.

| Prerequisite | Observed status |
|---|---|
| Separate reviewer templates with evidence and answer/decision columns | Verified, 226 rows per reviewer |
| Independent expert review actually completed | Pending, zero submitted complete pairs |
| Disagreement resolution and adjudication provenance | Pending |
| Exposure-filtered candidate reserve | 133 IDs preserved |
| Accepted cohort and adjudicated gold | Pending |
| Source documents, SQL/chain snapshot and rubric freeze | Pending coordinator approval |
| Current baseline and ablation scientific validation | Pending, implementation gaps recorded |
| Coordinator manual release bound to hashes | Absent |
| New confirmatory inference | Not executed |

confirmatory_readiness.py revalidates the actual reviewer files and adjudications rather than trusting an approval flag in import.json. It requires hash-bound coordinator provenance for independent humans and adjudications, a final disposition for every screened reserved candidate, a nonempty accepted subset, all freeze artifact roles and valid hashes, validation of B1–B4/A1–A4 tied to the same source configuration, and manual release tied to the import, reviews, freeze and adapter hashes. Missing or malformed inputs return NO-GO and exit code 2. Importing files alone never approves a run.

The coordinator must verify real reviewer independence and expertise. No code can infer those facts from a typed identity or attestation. The scripts verify completeness and binding of the supplied evidence. A draft checkbox, the old LLM ACCEPT decision or synthetic unit tests cannot establish human validation.

The run guard must be used before any new confirmatory launcher. Historical runners remain archived and are not certified by this check. Their old quality flags and condition names do not implement the new protocol. No full campaign entry point was modified to bypass existing security or evidence requirements.

Executed validation comprises 12 importer/readiness tests and nine offline adapter tests. The current draft inputs produced approved=false. The prior 27 harness and four agreement-helper tests retain their original evidence and are not newly re-executed here.

The reproducibility record hashes both existing reviewer templates, the exposure reserve, prior audit manifest, current research scripts and adapter source. Original benchmark data, existing results and all 133 reserved IDs remain unchanged. See BENCHMARK_FREEZE_CHECKLIST.md before submitting a future release.
