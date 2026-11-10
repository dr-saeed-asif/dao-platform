# Reproduction and provenance

This directory contains new retrospective analysis and sanitized read-only source checks. Original experimental responses and scores remain in exploratory_frozen_v1/v2. No model inference was repeated. One new isolated failed-receipt reproduction used actual gateway/use-case code with an injected receipt and in-memory persistence.

- `FAILURE_ANALYSIS.md`: exclusions, failure taxonomy, configuration, scoring and methodological validity.
- `CITATION_SUPPORT_ERRORS.md`: four source-linked contradicted budget claims, separating B3's disabled gate from B4's active gate.
- `ASSIGNMENT_WRITE_PATH.md`: canonical receipt, SQL status, executable write mechanism and historical attribution limits.
- JSON/CSV files retain observation-level references and calculations. `provenance.json` hashes this diagnosis; `preservation_check.json` checks older manifests without changing their data.

From the AI repository, with its existing virtual environment/dependencies, execute the DAO repository's `research_evaluation/failure_diagnosis/analyze_traces.py` using that interpreter and set PYTHONPATH to the AI repository. It reads saved responses and imported citation predicates, not an inference endpoint. From the DAO repository run `node research_evaluation/failure_diagnosis/reproduce_assignment_path.cjs` only when a new fixture observation is intended. The fixture writes its result exclusively, so the existing output must not be overwritten. Preserve separate results if repeating against a changed build. It requires existing workspace builds, TypeScript and Node dependencies.

`trace_assignment.py`, `database_history_metadata.py` and `read_checkpoint.py` are scoped read-only live inspections using the local configured database. Their future observations can differ and must be saved separately. Never publish local environment files or credentials. Full experiment reproduction and snapshot limitations remain documented in the original campaign READMEs. No human validation or causal architecture superiority is claimed.
