# Import and readiness workflow

The original reviewer CSVs are under research_evaluation/ai_independent_part2_v1/annotation/reviewer_A and reviewer_B. Preserve them. Give separate copies to independent experts and provide authorized access to the referenced evidence. Proposed AI gold is a separate second-stage reference file. Read HUMAN_REVIEW_INSTRUCTIONS.md first.

Import two actual completed submissions to a fresh directory:

```powershell
python research_evaluation/human_adjudication_v2/review_import.py --reviewer-a <reviewer_A.csv> --reviewer-b <reviewer_B.csv> --out <new-import-directory>
```

Partial submissions are recorded as incomplete. Input defects such as duplicate IDs or altered frozen question/evidence fields are rejected. Nothing is overwritten. The import copies submitted CSVs, records hashes and writes import.json, adjudication_tracking.csv, disagreements.csv and ADJUDICATION_TEMPLATE.csv. An empty disagreement file can mean no completed reviews, so always inspect the paired denominator.

When both real first-pass reviews are complete, a coordinator verifies independence using external human evidence and fills a separate copy of HUMAN_PROVENANCE_TEMPLATE.json. Bind it to the exact submitted CSV hashes. For disagreements, have a third expert complete the import's adjudication template and retain source evidence and reasons. Supply both files in a new import:

```powershell
python research_evaluation/human_adjudication_v2/review_import.py --reviewer-a <reviewer_A.csv> --reviewer-b <reviewer_B.csv> --adjudications <third-expert.csv> --human-provenance <verified-provenance.json> --out <new-reviewed-import-directory>
```

The provenance JSON must also verify and hash-bind adjudication CSVs when resolutions exist. Human identity and expertise are not authenticated by software. Keep private review receipts and names in controlled storage. Complete human-agreement reports are created only for actual provided complete review pairs with a matching coordinator attestation. No such report exists for the present blank files.

Fill a copy of EVIDENCE_FREEZE_TEMPLATE.json after checklist completion. Each role can have several artifacts, for example two source PDF files. Relative paths resolve from the freeze JSON. Source configuration hashes must agree with the adapter validation metadata. A new adapter report must replace the current negative readiness diagnostic with actual test/integration evidence only after the new adapters are implemented.

Once reviewers, adjudication, evidence and adapter checks are complete, the coordinator may fill a separate manual-release template with exact hashes. The readiness checker returns GO only if every prerequisite passes:

```powershell
python research_evaluation/human_adjudication_v2/confirmatory_readiness.py --import-dir <reviewed-import-directory> --freeze <approved-freeze.json> --adapters <current-adapter-validation.json> --release <manual-release.json>
```

Use this as a required preflight for a future campaign. Exit 2 means stop before inference. The current blank-preflight-02 import and draft inputs correctly return NO-GO. These import/check scripts do not execute a model.

Software tests actually executed from dao-platform:

```powershell
python -m unittest discover -s research_evaluation/human_adjudication_v2 -p test_review_import.py
<AI virtualenv Python> -m unittest discover -s research_evaluation/human_adjudication_v2 -p test_adapters.py
```

The current logs show 12 importer tests and nine adapter checks passed. The artifact manifest records hashes and prior-file preservation. Public-safe blank templates remain in the original package. Completed submissions and coordinator verification files may contain private reviewer data and are excluded by the local .gitignore patterns.
