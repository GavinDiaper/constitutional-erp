param(
  [switch]$SkipBuild,
  [switch]$SkipPostman,
  [switch]$SkipMeshFlows,
  [switch]$SkipHealthCheck,
  [switch]$SkipIdentityRedirectCheck,
  [switch]$SkipIdentityAuthSmokeCheck,
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

function Get-CurlResponseHead {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [string]$CookieJar,
    [string]$CookieFile
  )

  if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    throw "curl.exe is required for HTTP validation but was not found on PATH."
  }

  $args = @("-s", "-D", "-", "-o", "NUL")
  if (-not [string]::IsNullOrWhiteSpace($CookieJar)) {
    $args += @("-c", $CookieJar)
  }
  if (-not [string]::IsNullOrWhiteSpace($CookieFile)) {
    $args += @("-b", $CookieFile)
  }
  $args += $Url

  $headersText = (& curl.exe @args) -join "`n"
  if ([string]::IsNullOrWhiteSpace($headersText)) {
    throw "HTTP validation failed: empty response headers from ${Url}"
  }

  $statusMatch = [regex]::Match($headersText, "HTTP/\d(?:\.\d)?\s+(\d{3})")
  if (-not $statusMatch.Success) {
    throw "HTTP validation failed: unable to parse status from headers '$headersText'"
  }

  $locationMatch = [regex]::Match($headersText, "(?im)^location:\s*(.+)$")
  $location = if ($locationMatch.Success) { $locationMatch.Groups[1].Value.Trim() } else { "" }

  return @{
    StatusCode = [int]$statusMatch.Groups[1].Value
    Location = $location
    HeadersText = $headersText
  }
}

function Test-IdentityProviderRedirects {
  $providers = @("google", "microsoft", "apple")
  foreach ($provider in $providers) {
    $url = "http://localhost:4174/login/$provider"
    $response = Get-CurlResponseHead -Url $url
    $statusCode = [int]$response.StatusCode
    $location = [string]$response.Location

    if ($statusCode -ne 302) {
      throw "Identity redirect probe failed for ${provider}: expected 302, got $statusCode"
    }

    if ([string]::IsNullOrWhiteSpace($location)) {
      throw "Identity redirect probe failed for ${provider}: missing Location header"
    }

    $expectedPrefix = "http://localhost:4008/auth/login/$provider"
    if (-not $location.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Identity redirect probe failed for ${provider}: expected Location prefix '$expectedPrefix', got '$location'"
    }
  }
}

function Test-UiIdentityAuthSmoke {
  $cookieJar = Join-Path ([System.IO.Path]::GetTempPath()) ("identity-smoke-{0}.cookies" -f ([guid]::NewGuid().ToString("N")))

  try {
    # Protected route should redirect to identity login app when unauthenticated.
    $initial = Get-CurlResponseHead -Url "http://localhost:4173/dashboard"
    if ($initial.StatusCode -ne 303 -or [string]::IsNullOrWhiteSpace($initial.Location) -or -not $initial.Location.StartsWith("http://localhost:4174", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "UI auth smoke failed: expected unauthenticated /dashboard -> 303 to identity app, got status=$($initial.StatusCode), location='$($initial.Location)'"
    }

    # Start provider login from identity app (mock flow).
    $providerStart = Get-CurlResponseHead -Url "http://localhost:4174/login/google?next=%2Fdashboard"
    if ($providerStart.StatusCode -ne 302 -or [string]::IsNullOrWhiteSpace($providerStart.Location)) {
      throw "UI auth smoke failed: expected provider start redirect from identity app, got status=$($providerStart.StatusCode), location='$($providerStart.Location)'"
    }

    # Follow callback redirect chain until it lands on /dashboard.
    $redirectUrl = $providerStart.Location
    $redirectedToDashboard = $false
    for ($hop = 0; $hop -lt 5; $hop++) {
      $hopResponse = Get-CurlResponseHead -Url $redirectUrl -CookieJar $cookieJar -CookieFile $cookieJar
      if (($hopResponse.StatusCode -ne 302 -and $hopResponse.StatusCode -ne 303) -or [string]::IsNullOrWhiteSpace($hopResponse.Location)) {
        throw "UI auth smoke failed: expected redirect in callback chain, got status=$($hopResponse.StatusCode), location='$($hopResponse.Location)'"
      }

      if ($hopResponse.Location.EndsWith("/dashboard")) {
        $redirectedToDashboard = $true
        break
      }

      $redirectUrl = $hopResponse.Location
    }

    if (-not $redirectedToDashboard) {
      throw "UI auth smoke failed: callback chain did not reach /dashboard within 5 redirects"
    }

    # Authenticated dashboard should load.
    $dashboardAuthed = Get-CurlResponseHead -Url "http://localhost:4173/dashboard" -CookieFile $cookieJar
    if ($dashboardAuthed.StatusCode -ne 200) {
      throw "UI auth smoke failed: expected authenticated /dashboard -> 200, got status=$($dashboardAuthed.StatusCode)"
    }

    # Logout should redirect to identity login app.
    $logout = Get-CurlResponseHead -Url "http://localhost:4173/auth/logout" -CookieJar $cookieJar -CookieFile $cookieJar
    if ($logout.StatusCode -ne 303 -or [string]::IsNullOrWhiteSpace($logout.Location) -or -not $logout.Location.StartsWith("http://localhost:4174", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "UI auth smoke failed: expected /auth/logout -> 303 to identity app, got status=$($logout.StatusCode), location='$($logout.Location)'"
    }

    # Protected route should be blocked again after logout.
    $dashboardAfterLogout = Get-CurlResponseHead -Url "http://localhost:4173/dashboard" -CookieFile $cookieJar
    if ($dashboardAfterLogout.StatusCode -ne 303 -or [string]::IsNullOrWhiteSpace($dashboardAfterLogout.Location) -or -not $dashboardAfterLogout.Location.StartsWith("http://localhost:4174", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "UI auth smoke failed: expected post-logout /dashboard -> 303 to identity app, got status=$($dashboardAfterLogout.StatusCode), location='$($dashboardAfterLogout.Location)'"
    }
  } finally {
    if (Test-Path $cookieJar) {
      Remove-Item -Path $cookieJar -Force -ErrorAction SilentlyContinue
    }
  }
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

function Reset-DockerServiceDatabases {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DockerCommand,
    [Parameter(Mandatory = $true)]
    [string[]]$ComposeArguments
  )

  $dbServices = Get-DbBackedComposeServices

  # Stop DB-backed services so SQLite files can be removed safely.
  & $DockerCommand @(@() + $ComposeArguments + @("stop") + $dbServices)

  foreach ($service in $dbServices) {
    $cleanupScript = "rm -f /data/*.db /data/*.db-wal /data/*.db-shm"
    & $DockerCommand @(@() + $ComposeArguments + @("run", "--rm", "--no-deps", "--entrypoint", "/bin/sh", $service, "-c", $cleanupScript))
  }

  & $DockerCommand @(@() + $ComposeArguments + @("up", "-d") + $dbServices)
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

  if (-not $SkipPostman) {
    Invoke-Stage -Name "Reset DB-backed service databases" -Action {
      Reset-DockerServiceDatabases -DockerCommand $docker -ComposeArguments $composeArgs
    }
  }

  if (-not $SkipHealthCheck) {
    Invoke-Stage -Name "Health check published services" -Action {
      & powershell -ExecutionPolicy Bypass -File $runSystems "health" "-TimeoutSeconds" "$TimeoutSeconds"
    }
  }

  if (-not $SkipIdentityRedirectCheck) {
    Invoke-Stage -Name "Validate user-identity provider redirects" -Action {
      Test-IdentityProviderRedirects
    }
  }

  if (-not $SkipIdentityAuthSmokeCheck) {
    Invoke-Stage -Name "Validate UI identity auth smoke flow" -Action {
      Test-UiIdentityAuthSmoke
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