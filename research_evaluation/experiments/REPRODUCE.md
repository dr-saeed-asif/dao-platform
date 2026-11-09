# Reproduction

Source revisions and method are in the audit and methodology. Keep the existing deployment read-only. Create a fresh result label for each rerun. To rerun the live verification script, start Nest on port 3002 with its local configuration. Use the existing configured test deployment and PostgreSQL records, or update the proposal identifiers in the scripts for an equivalent fixture. Keep all tokens and DSNs in the application environment.

PowerShell commands. Set `$EvalRoot` to the absolute path of this `research_evaluation` directory. Run the Python commands from the AI repository:

```powershell
$env:PYTHONPATH = (Get-Location).Path
& .\.venv\Scripts\python.exe -m unittest discover -s tests -v
& .\.venv\Scripts\python.exe "$EvalRoot\experiments\pilot.py" --label default-model-rerun
& .\.venv\Scripts\python.exe "$EvalRoot\experiments\pilot.py" --label direct-db-rerun --cases DB1 DB2 DB3 DB4 --modes direct_specialist --repeats 3
$env:OLLAMA_CHAT_MODEL = 'qwen3:0.6b'
$env:OLLAMA_FAST_MODEL = 'qwen3:0.6b'
& .\.venv\Scripts\python.exe "$EvalRoot\experiments\pilot.py" --label pilot-small-rerun --cases DB1 DB2 DOC1 DOC2
& .\.venv\Scripts\python.exe "$EvalRoot\experiments\analyze.py" pilot-small-rerun
$env:PYTHONPATH = (Get-Location).Path + ';' + (Join-Path (Get-Location).Path 'tests')
& .\.venv\Scripts\python.exe "$EvalRoot\experiments\citation_challenge.py"
```

Run the verification script and API tests from the DAO repository root:

```powershell
$env:NODE_PATH = (Join-Path (Get-Location).Path 'node_modules')
node "$EvalRoot\experiments\live-verification.cjs" "$EvalRoot\raw_results\live-verification-rerun.json"
node "$EvalRoot\experiments\wallet-probes.cjs" "$EvalRoot\raw_results\wallet-probes-rerun.json"
Get-Content "$EvalRoot\experiments\gold.sql" | docker exec -i cybergovai-postgres psql -X -v ON_ERROR_STOP=1 -U cybergovai -d cybergovai --csv
Push-Location apps/api
& ..\..\node_modules\.bin\jest.cmd --runInBand
Pop-Location
Push-Location packages/contracts
node --test test/CyberDAOGovernance.test.mjs
Pop-Location
```

Plot with Matplotlib 3.11.2 installed in a separate environment and call `python plot.py pilot-small` using the file in this directory. It reads the original verification snapshot and named raw run directories. Use `analyze.py <label>` with the AI repository on `PYTHONPATH`. The report's numeric claims refer to the captured runs, not results from a future rerun. Review gold and inspect retained sources before comparing deployments. Local absolute paths may occur in test stack frames, and wallet/transaction hex values and URLs are removed from pilot output. Keep the raw artifact folder internal until a publication privacy review is complete.

For the SSE probe, run `run_server.py` in a separate process with `RAG_PORT=8101`, both chat model settings set to `qwen3:0.6b`, and `DAO_BACKEND_URL=http://127.0.0.1:3002`. Then run `http_stream.py` with the AI repository on `PYTHONPATH` after other model work finishes. It creates and deletes three temporary conversations under an ephemeral operator owner. Use a fresh output directory or archive the previous output before rerunning, since it opens the result file exclusively. This probe measures the FastAPI boundary and does not alter governance records. Run `report.py` to regenerate the captured-results report after its three analysis summaries have been generated.

The runner gained a case selector before the small-model campaign and a separate direct-specialist mode afterward. Raw manifests retain the script hash at launch. The later addition did not change the four model-variant branches used by the earlier campaigns.
