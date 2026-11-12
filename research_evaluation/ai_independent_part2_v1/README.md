# Independent AI benchmark review package

Start with CYBERDAO_BENCHMARK_AUDIT.md and HUMAN_ADJUDICATION_GUIDE.md. Give reviewer_A and reviewer_B separate copies of their own template and access to the same evidence references. Their first pass should author answers from evidence before viewing annotation/proposed_gold_reference.json. The coordinator retains item_registry.json and the exposure ledger. The annotation pool has 226 rows and contains all original 200 IDs plus 26 prior replacement candidates.

The current result is a readiness package with zero new model runs. The reserve of 133 IDs is unchanged. Independent human labels are absent. The human-agreement, claim-results and ablation-results CSVs therefore contain headers only. AI_BASELINE_RESULTS.csv reproduces four labelled historical resource measurements using the old baseline definitions. It is not a new comparison.

To check submitted reviewer files, run from dao-platform:

```powershell
python research_evaluation/ai_independent_part2_v1/assess_reviews.py research_evaluation/ai_independent_part2_v1/annotation/reviewer_A/HUMAN_ANNOTATION_TEMPLATE.csv research_evaluation/ai_independent_part2_v1/annotation/reviewer_B/HUMAN_ANNOTATION_TEMPLATE.csv
python -m unittest discover -s research_evaluation/ai_independent_part2_v1 -p test_assess_reviews.py
```

The current templates return pending with zero completed pairs and null agreement. The helper does not certify human independence, author gold labels or resolve disputes.

The source package was created with prepare.py. That script refuses overwriting its CSV/JSON outputs. Reproduction requires a fresh output package directory and the same pinned historical input artifacts. Current report text and proposed conditions were then written as part of this task. The manifest hashes the final artifacts and input sources.

The existing benchmark statistical helpers are in the AI repository's benchmark/stats.py. Its deterministic harness tests were executed with the AI virtual environment through python -m unittest discover -s tests -p test_benchmark_harness.py, yielding 27 passing tests. This test command performs no model inference.

Model inventory used GET /api/tags and GET /api/version at loopback Ollama. The model metadata, CPU and GPU records are supplied for future configuration review. No model was loaded for a new generation. PROPOSED_CONDITIONS.json specifies the new baseline meanings and marks unimplemented or unvalidated adapters. It is not an executable switch. The server does not implement an experiment merely because a runner payload declares a mode.

After genuine independent review and disagreement resolution, freeze a new source/gold/evidence version and validate adapters before inference. Preserve the original templates, submitted reviews and adjudication history as separate versions. Keep reviewer reference answers out of model prompts and require the existing signed identity and least-privilege interfaces for current HTTP integration.

Current production byte-integrity checks require access to trusted source files. Archived harnesses and snapshots predate some security fixes. Their prior validations cannot be reused as a current deployment certificate. Each historical experiment remains identified by its own configuration.

All requested deliverables are in this directory. No confirmatory result should be inferred from empty tables or a prepared protocol.
