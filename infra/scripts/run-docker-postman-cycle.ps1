param(
  [switch]$SkipBuild,
  [switch]$SkipPostman,
  [switch]$SkipMeshFlows,
  [switch]$SkipHealthCheck,
  [int]$TimeoutSeconds = 60,
  [string]$ComposeFile = "",
  [string]$ComposeEnvFile = ""
)

$ErrorActionPreference = "Stop"

$ScriptsRoot = $PSScriptRoot
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

function Assert-DockerDaemonReady {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DockerCommand,
    [int]$MaxAttempts = 3,
    [int]$DelaySeconds = 3
  )

  $lastOutput = ""

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $probeExitCode = 1
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()
    try {
      $probe = Start-Process -FilePath $DockerCommand -ArgumentList @("info") -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
      $stdout = Get-Content -Path $stdoutPath -Raw -ErrorAction SilentlyContinue
      $stderr = Get-Content -Path $stderrPath -Raw -ErrorAction SilentlyContinue
      $probeExitCode = $probe.ExitCode
      if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        $lastOutput = $stderr.Trim()
      } else {
        $lastOutput = $stdout.Trim()
      }
    } finally {
      Remove-Item -Path $stdoutPath, $stderrPath -ErrorAction SilentlyContinue
    }

    if ($probeExitCode -eq 0) {
      return
    }

    if ($attempt -lt $MaxAttempts) {
      Write-Host "Docker daemon not ready yet (attempt $attempt/$MaxAttempts). Retrying in $DelaySeconds seconds..."
      Start-Sleep -Seconds $DelaySeconds
    }
  }

  $desktopProcesses = @(Get-Process -Name "Docker Desktop", "com.docker.backend" -ErrorAction SilentlyContinue)
  $desktopRunning = $desktopProcesses.Count -gt 0
  $linuxPipeMissing = $lastOutput -match "dockerDesktopLinuxEngine"

  $guidance = @(
    "Docker daemon is not reachable from this shell.",
    $(if ($desktopRunning) { "Docker Desktop process is running, but the engine is not ready yet." } else { "Docker Desktop process does not appear to be running." }),
    $(if ($linuxPipeMissing) { "The Linux engine pipe is unavailable. Start Docker Desktop and ensure it is using Linux containers." } else { "Start Docker Desktop and wait for it to report that the engine is running." }),
    "Then rerun: npm run docker:rebuild"
  ) -join " "

  Write-Host $guidance -ForegroundColor Yellow
  throw "Last Docker error:`n$lastOutput"
}

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

  $global:LASTEXITCODE = 0
  & $Action
  $stageExitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { [int]$global:LASTEXITCODE }
  if ($stageExitCode -ne 0) {
    throw "Stage failed: $Name (exit code $stageExitCode)"
  }
}

$docker = Get-DockerCommand
$composeArgs = @("compose", "-f", $ComposeFile)
if (Test-Path $ComposeEnvFile) {
  $composeArgs += @("--env-file", $ComposeEnvFile)
}

$runSystems = Join-Path $ScriptsRoot "run-systems.ps1"
$runFullCycle = Join-Path $ScriptsRoot "run-full-postman-cycle.ps1"

Set-Location $RepoRoot

try {
  Invoke-Stage -Name "Verify Docker daemon connectivity" -Action {
    Assert-DockerDaemonReady -DockerCommand $docker
  }

  Invoke-Stage -Name "Build and start Docker Compose stack" -Action {
    $upArgs = @() + $composeArgs + @("up")
    if (-not $SkipBuild) {
      $upArgs += "--build"
    }
    $upArgs += @("-d")
    & $docker @upArgs
  }

  if (-not $SkipHealthCheck) {
    Invoke-Stage -Name "Health check published services" -Action {
      & powershell -ExecutionPolicy Bypass -File $runSystems "health" "-TimeoutSeconds" "$TimeoutSeconds"
    }
  }

  if (-not $SkipPostman) {
    Invoke-Stage -Name "Run Newman against Docker-published services" -Action {
      $fullCycleArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $runFullCycle,
        "-UseExistingServices",
        "-TimeoutSeconds", "$TimeoutSeconds"
      )
      if ($SkipMeshFlows) {
        $fullCycleArgs += "-SkipMeshFlows"
      }
      if ($SkipHealthCheck) {
        $fullCycleArgs += "-SkipHealthCheck"
      }
      & powershell @fullCycleArgs
    }
  }

  Write-Host ""
  Write-Host "Docker rebuild and retest completed successfully."
  exit 0
} catch {
  if ($_.Exception -and $_.Exception.Message) {
    Write-Host $_.Exception.Message -ForegroundColor Red
  } else {
    Write-Host $_ -ForegroundColor Red
  }
  exit 1
}