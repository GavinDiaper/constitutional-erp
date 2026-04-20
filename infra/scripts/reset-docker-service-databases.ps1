param(
  [string]$ComposeFile = "",
  [string]$ComposeEnvFile = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ComposeFile)) {
  $ComposeFile = Join-Path $RepoRoot "infra\compose\docker-compose.yml"
}

if ([string]::IsNullOrWhiteSpace($ComposeEnvFile)) {
  $ComposeEnvFile = Join-Path $RepoRoot ".env.compose.example"
}

if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}

function Get-DockerCommand {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    return "docker"
  }

  throw "Docker CLI not found on PATH. Install Docker Desktop and ensure 'docker' is available in the shell."
}

function Get-DbBackedComposeServices {
  return @(
    "foundation-erp",
    "authority-engine",
    "governance-engine",
    "mesh-gateway",
    "event-processor",
    "process-graph",
    "user-identity",
    "navigator-ai"
  )
}

$docker = Get-DockerCommand
$composeArgs = @("compose", "-f", $ComposeFile)
if (Test-Path $ComposeEnvFile) {
  $composeArgs += @("--env-file", $ComposeEnvFile)
}

$dbServices = Get-DbBackedComposeServices

Write-Host "Stopping DB-backed services..."
& $docker @(@() + $composeArgs + @("stop") + $dbServices)

foreach ($service in $dbServices) {
  Write-Host "Clearing SQLite data for $service..."
  $cleanupScript = "rm -f /data/*.db /data/*.db-wal /data/*.db-shm"
  & $docker @(@() + $composeArgs + @("run", "--rm", "--no-deps", "--entrypoint", "/bin/sh", $service, "-c", $cleanupScript))
}

Write-Host "Starting DB-backed services..."
& $docker @(@() + $composeArgs + @("up", "-d") + $dbServices)

Write-Host "Docker DB reset completed."
