param(
  [string]$DaoRoot = "E:\DAO\cyber-chain-work\dao-platform",
  [string]$AiRoot  = "E:\DAO\cyber-chain-work\api-ai-server"
)

$ErrorActionPreference = "Stop"
$pythonEnv = Join-Path $AiRoot ".env"
$webRoot = Join-Path $DaoRoot "apps\web"
$webEnv = Join-Path $webRoot ".env.local"
$webPage = Join-Path $webRoot "src\app\ai-demo\page.tsx"
$webRoute = Join-Path $webRoot "src\app\api\ai-demo\route.ts"

if (-not (Test-Path -LiteralPath $pythonEnv)) { throw "Missing Python .env: $pythonEnv" }
if (-not (Test-Path -LiteralPath $webPage) -or -not (Test-Path -LiteralPath $webRoute)) {
  throw "Frontend overlay files not found. Extract the ZIP to the DAO platform root before setup."
}

$tokenMatches = @(Get-Content -LiteralPath $pythonEnv | Where-Object { $_ -match '^\s*RAG_DEV_TOKEN\s*=' })
if ($tokenMatches.Count -ne 1) { throw "Expected exactly one RAG_DEV_TOKEN entry in Python .env." }
$ragToken = ($tokenMatches[0] -split '=', 2)[1].Trim().Trim('"').Trim("'")
if ($ragToken.Length -lt 24) { throw "RAG_DEV_TOKEN must contain at least 24 characters." }

$bytes = New-Object byte[] 16
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$password = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""

if (Test-Path -LiteralPath $webEnv) {
  $backup = "$webEnv.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $webEnv -Destination $backup
  Write-Host "Backed up existing .env.local (private)."
  $oldLines = @(Get-Content -LiteralPath $webEnv)
} else {
  $oldLines = @()
}

$pattern = '^\s*CYBERDAO_RAG_(DEMO_ENABLED|DEMO_PASSWORD|TOKEN|URL)\s*='
$keep = @($oldLines | Where-Object { $_ -notmatch $pattern })
$append = @(
  "CYBERDAO_RAG_DEMO_ENABLED=true",
  "CYBERDAO_RAG_DEMO_PASSWORD=$password",
  "CYBERDAO_RAG_TOKEN=$ragToken",
  "CYBERDAO_RAG_URL=http://127.0.0.1:8001"
)
$text = (($keep + "" + "# Local-only CyberDAO AI demo (never commit)" + $append) -join "`n").TrimEnd() + "`n"
[System.IO.File]::WriteAllText($webEnv, $text, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "=== Local frontend demo installed ===" -ForegroundColor Green
Write-Host "Next.js route: /ai-demo"
Write-Host "Python RAG: http://127.0.0.1:8001"
Write-Host "Generated operator DEMO PASSWORD: $password" -ForegroundColor Yellow
Write-Host "Use the password only in the local /ai-demo screen."
Write-Host "Do not share the password, .env.local, or Python RAG_DEV_TOKEN."
Write-Host "Restart Next.js so it reads the updated .env.local."
