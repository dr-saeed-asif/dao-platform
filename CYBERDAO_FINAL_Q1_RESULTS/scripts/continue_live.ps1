$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server'
$env:RAG_DEV_TOKEN='research-local-import-only-000000'
$env:PYTHONPATH=(Get-Location).Path
$researchTask='E:/DAO/cyber-chain-work/dao-platform/CYBERDAO_FINAL_Q1_RESULTS'
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/run_live_remaining.py" --smoke
if($LASTEXITCODE -ne 0){throw 'Live smoke interrupted: preserve records'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/validate_live_smoke.py"
if($LASTEXITCODE -ne 0){throw 'Live smoke harness validation failed; full execution blocked'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/run_live_remaining.py"
if($LASTEXITCODE -ne 0){throw 'Live campaign interrupted: preserve checkpoint'}
