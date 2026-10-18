param(
  [string]$DaoRoot = "E:\DAO\cyber-chain-work\dao-platform",
  [string]$BaseUrl = "http://127.0.0.1:3001"
)

$ErrorActionPreference = "Stop"
$webEnv = Join-Path $DaoRoot "apps\web\.env.local"
if (-not (Test-Path $webEnv)) { throw "Missing $webEnv" }
$line = @(Get-Content -LiteralPath $webEnv | Where-Object { $_ -match '^\s*CYBERDAO_RAG_DEMO_PASSWORD\s*=' }) | Select-Object -Last 1
if (-not $line) { throw "Run setup_frontend_demo.ps1 first." }
$password = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")

$headers = @{ Origin = $BaseUrl }
$endpoint = "$BaseUrl/api/ai-demo"
function Send-Demo([object]$payload) {
  $json = $payload | ConvertTo-Json -Depth 5 -Compress
  try {
    $response = Invoke-WebRequest -Uri $endpoint -Method Post -Headers $headers -ContentType "application/json" -Body $json -UseBasicParsing -TimeoutSec 150
    return @{ Code = [int]$response.StatusCode; Body = ($response.Content | ConvertFrom-Json) }
  } catch {
    if ($_.Exception.Response) {
      return @{ Code = [int]$_.Exception.Response.StatusCode; Body = $null }
    }
    throw
  }
}

$good = @{
  password = $password
  daoId = "cyber-security-dao"
  proposalId = "620bc74c-dde0-4532-9c4c-11e31b91983f"
  system = "hybrid"
  topK = 4
  question = "What deliverables are expected from this security audit?"
}
$badPassword = @{} + $good
$badPassword.password = "incorrect"
$r1 = Send-Demo $badPassword
if ($r1.Code -ne 401) { throw "Expected 401 for invalid password; received $($r1.Code)." }
Write-Host "PASS: Wrong operator password -> HTTP 401" -ForegroundColor Green

$badScope = @{} + $good
$badScope.daoId = "cyber-dao1234"
$badScope.proposalId = "onchain-31"
$r2 = Send-Demo $badScope
if ($r2.Code -ne 403) { throw "Expected 403 for unapproved scope; received $($r2.Code)." }
Write-Host "PASS: Unapproved DAO/proposal -> HTTP 403" -ForegroundColor Green

$r3 = Send-Demo $good
if ($r3.Code -ne 200) { throw "Expected HTTP 200; received $($r3.Code)." }
$ids = @($r3.Body.evidence | ForEach-Object { $_.source_id })
if (($ids -notcontains "G1") -or ($ids -notcontains "D1")) {
  throw "Expected governance G1 and PDF D1 evidence."
}
Write-Host "PASS: Next.js -> FastAPI -> PostgreSQL/Ollama -> Next.js: HTTP 200" -ForegroundColor Green
Write-Host "PASS: Both G1 and D1 evidence returned" -ForegroundColor Green
Write-Host "Run ID: $($r3.Body.runId)"
Write-Host "End-to-end latency: $($r3.Body.latencyMs) ms"
Write-Host "=== LOCAL FRONTEND INTEGRATION SMOKE TEST PASSED ===" -ForegroundColor Green
