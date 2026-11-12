$ErrorActionPreference='Stop'
$researchTask='E:/DAO/cyber-chain-work/dao-platform/CYBERDAO_FINAL_Q1_RESULTS'
if(Get-Process -Id 29456 -ErrorAction SilentlyContinue){Wait-Process -Id 29456}
if(-not(Test-Path -LiteralPath "$researchTask/live_campaign/completion.json")){throw 'Live campaign incomplete: preserve all outputs; no completed-campaign freeze claimed'}
Set-Location -LiteralPath 'E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server'
$env:RAG_DEV_TOKEN='research-local-import-only-000000'
$env:PYTHONPATH=(Get-Location).Path
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/analyze.py"
if($LASTEXITCODE -ne 0){throw 'Analysis failed'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/report_live.py"
if($LASTEXITCODE -ne 0){throw 'Report generation failed'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/check_transport.py"
if($LASTEXITCODE -ne 0){throw 'Transport audit failed'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/figures.py"
if($LASTEXITCODE -ne 0){throw 'Figures failed'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/mark_collection_complete.py"
if($LASTEXITCODE -ne 0){throw 'Completion denominator mismatch'}
& .venv/Scripts/python.exe -X utf8 "$researchTask/scripts/seal.py"
if($LASTEXITCODE -ne 0){throw 'Manifest failed'}

