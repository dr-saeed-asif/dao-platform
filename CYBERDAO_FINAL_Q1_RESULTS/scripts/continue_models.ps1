param([int]$B1ProcessId=33584)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server'
$env:RAG_DEV_TOKEN='research-local-import-only-000000'
$env:PYTHONPATH=(Get-Location).Path
$researchTask='E:/DAO/cyber-chain-work/dao-platform/CYBERDAO_FINAL_Q1_RESULTS'
if(Get-Process -Id $B1ProcessId -ErrorAction SilentlyContinue){Wait-Process -Id $B1ProcessId}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/frozen_corpus_rag.py" --smoke
if($LASTEXITCODE -ne 0){throw 'Frozen RAG development execution failed; preserve checkpoint'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/validate_frozen_smoke.py"
if($LASTEXITCODE -ne 0){throw 'Frozen RAG smoke harness invalid; benchmark blocked'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/frozen_corpus_rag.py"
if($LASTEXITCODE -ne 0){throw 'Frozen RAG execution interrupted; preserve checkpoint'}
