param(
  [switch]$KillPorts,
  [int]$TimeoutSeconds = 60,
  [switch]$SkipMeshFlows,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
Set-Location $Root

function Invoke-Stage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "============================================================"
  Write-Host "[stage] $Name"
  Write-Host "============================================================"

  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "Stage failed: $Name (exit code $LASTEXITCODE)"
  }
}

$runSystems = Join-Path $Root "run-systems.ps1"
$buildUnified = Join-Path $Root "postman\build-unified-postman.js"
$runNewman = Join-Path $Root "postman\newman\run-newman.js"

if (-not (Test-Path $runSystems)) {
  throw "Missing script: $runSystems"
}
if (-not (Test-Path $buildUnified)) {
  throw "Missing script: $buildUnified"
}
if (-not (Test-Path $runNewman)) {
  throw "Missing script: $runNewman"
}

$commonSystemArgs = @()
if ($KillPorts) {
  $commonSystemArgs += "-KillPorts"
}
$commonSystemArgs += "-TimeoutSeconds"
$commonSystemArgs += "$TimeoutSeconds"

try {
  Invoke-Stage -Name "Stop all services" -Action {
    & powershell -ExecutionPolicy Bypass -File $runSystems "stop" @commonSystemArgs
  }

  Invoke-Stage -Name "Clear data and recreate SQLite via migrations" -Action {
    & powershell -ExecutionPolicy Bypass -File $runSystems "resetdb" @commonSystemArgs
  }

  Invoke-Stage -Name "Build unified Postman collection and environment" -Action {
    & node $buildUnified
  }

  Invoke-Stage -Name "Start all services" -Action {
    & powershell -ExecutionPolicy Bypass -File $runSystems "start" @commonSystemArgs
  }

  if (-not $SkipHealthCheck) {
    Invoke-Stage -Name "Health check all services" -Action {
      & powershell -ExecutionPolicy Bypass -File $runSystems "health" @commonSystemArgs
    }
  }

  Invoke-Stage -Name "Run all component postman suites" -Action {
    & node $runNewman "all"
  }

  if (-not $SkipMeshFlows) {
    Invoke-Stage -Name "Run all mesh domain flow suites" -Action {
      & node $runNewman "mesh-all"
    }
  }

  Write-Host ""
  Write-Host "Full cycle completed successfully."
  exit 0
} catch {
  Write-Error $_
  exit 1
}
