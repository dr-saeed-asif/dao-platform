param([Parameter(Mandatory=$true)][int]$RunnerPid)
$ErrorActionPreference = 'Stop'
$resultRoot = Split-Path $PSScriptRoot -Parent
$aiRoot = 'E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server'
$env:RAG_DEV_TOKEN = 'research-local-import-only-000000'
$env:PYTHONPATH = $aiRoot
Set-Location -LiteralPath $aiRoot
# A foreground runner owns the only raw-file writer. This helper never generates
# predictions, restarts attempts or changes configuration. Finalization fails
# closed unless all expected keys, source checks and historical prefixes pass.
Wait-Process -Id $RunnerPid -ErrorAction SilentlyContinue
& "$aiRoot/.venv/Scripts/python.exe" -X utf8 "$resultRoot/scripts/finalize_resume.py"
if ($LASTEXITCODE -ne 0) {
    throw "Offline finalization failed (exit $LASTEXITCODE); inspect resume-finalizer logs. No model attempts were retried."
}
