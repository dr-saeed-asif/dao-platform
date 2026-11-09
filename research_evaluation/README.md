# CyberDAO measured evaluation

Start with [experimental results](reports/Q1_EXPERIMENTAL_RESULTS.md) and [methodology](reports/METHODOLOGY.md).

- `audit/` contains implementation evidence, infrastructure, calculation validation and artifact hashes.
- `datasets/` contains benchmark questions, gold values and source provenance.
- `datasets/source_documents/` preserves the two original synthetic demonstration PDFs with their verified hashes.
- `experiments/` contains isolated evaluation and analysis scripts with [reproduction commands](experiments/REPRODUCE.md).
- `raw_results/` retains original measured runs and test logs. Treat these as internal pending publication privacy review.
- `analysis/` contains derived statistics and the unblinded claim annotations.
- `tables/` contains CSV exports and a LaTeX model comparison.
- `figures/` contains standalone SVG and 300 dpi PNG figures.

The small-model pilot covers four purposive questions with two repeats across four variants. Lexical gold hits are distinct from complete answer correctness. One contradictory additional assertion was found in the four first-repeat full answers. Larger held-out experiments and independent annotation remain necessary.

Finalize existing observations without application calls using `python experiments/finalize.py`, `python experiments/report.py`, and `python experiments/plot.py pilot-small` with Matplotlib available. Run `python experiments/seal.py` last. The finalizer checks saved row identifiers, lexical scores, reference IDs, Wilson intervals, medians and table totals. It preserves raw measurements. No completed experiments need to be rerun to regenerate these final summaries.
