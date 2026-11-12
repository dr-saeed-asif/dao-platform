# Evidence-freeze checklist

Use templates/EVIDENCE_FREEZE_TEMPLATE.json only after human review and resolution. All paths and SHA-256 hashes must resolve to the final approved artifacts. Relative paths resolve from the freeze file's directory. Preserve the prior snapshots and reserve.

- [ ] Record all 133 screened IDs with their human accept/reject decisions and unresolved revisions. Freeze the accepted cohort IDs in sorted order and retain excluded-item reasons.
- [ ] Hash the final model-visible question dataset separately from adjudicated gold. Keep gold, reviewer material and rubrics outside model prompts.
- [ ] Hash final expected answers, required facts, unsupported-inference constraints, acceptable abstentions and authorization contexts.
- [ ] Retain sealed reviewer A/B CSVs, hash-bound human-provenance verification, agreement denominators and third-expert resolutions.
- [ ] Hash original source PDFs or their archived bytes, identify page-level evidence, and label synthetic demonstration documents as synthetic. Preserve extraction/version information.
- [ ] Freeze SQL proposal records, relevant votes/assignments, proposal/artefact links, manifest hashes and any required source files with a transaction snapshot identifier and capture time.
- [ ] Freeze pinned chain height/hash, chain ID, contract, RPC identity fingerprint, confirmation policy, checkpoint scope and uncertainty. State whether calls replay a snapshot or access a live provider.
- [ ] Demonstrate current trusted file access for the M5 byte checks. Stale or unavailable evidence must remain visible as unavailable.
- [ ] Hash the exact source tree or immutable commit plus patch/source bundle. Include C4/C5 access requirements and scoped wallet/DAO/proposal permissions. Never put secrets in artifacts.
- [ ] Freeze model and embedding names/digests, effective decoding, seeds, repetition and ordering policy, time/call budgets, hardware and inference server version.
- [ ] Hash each system/user prompt and tool schema. Audit for gold answer, title and scope leakage.
- [ ] Freeze current B1–B4 and A1–A4 definitions separately from historical names. Keep A3/B4 aliases from doubling observations.
- [ ] Validate retrieval/tool parity, structured errors, C4 identity and C5 permissions, deterministic extractor bypass, all claim-gate aliases, temporary patch restoration and producer attribution.
- [ ] Predeclare whole-answer and claim-level scoring, structural citation validity, abstention and failure denominators, paired tests, question dependence, bootstrap units and multiplicity handling.
- [ ] Record every attempt with error and fallback attribution. Missing token usage remains null.
- [ ] Verify every artifact hash. Bind manual coordinator release to the current import, submitted review hashes, freeze file and adapter validation file.
- [ ] Run confirmatory_readiness.py. NO-GO must terminate the proposed campaign before inference.

The checklist records scientific prerequisites. A scan checkpoint or agreement between one RPC and SQL is insufficient evidence of independent blockchain integrity. Hash completeness does not authenticate human expertise. Coordinator verification and manual release remain necessary.
