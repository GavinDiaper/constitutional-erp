param(
  [ValidateSet("start", "stop", "restart", "status", "health", "killports", "resetdb")]
  [string]$Action = "start",
  [switch]$KillPorts,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$ScriptsRoot = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$RuntimeDir = Join-Path $ScriptsRoot ".runtime"
$LogsDir = Join-Path $ScriptsRoot "logs"
$StatePath = Join-Path $RuntimeDir "services-state.json"

$ServiceTemplates = @(
  @{
    Name = "foundation-erp"
    Path = Join-Path $RepoRoot "services\foundation-erp"
    DefaultPort = 3000
  },
  @{
    Name = "authority-engine"
    Path = Join-Path $RepoRoot "services\authority-engine"
    DefaultPort = 4001
  },
  @{
    Name = "governance-engine"
    Path = Join-Path $RepoRoot "services\governance-engine"
    DefaultPort = 4002
  },
  @{
    Name = "mesh-gateway"
    Path = Join-Path $RepoRoot "services\mesh-gateway"
    DefaultPort = 4003
  },
  @{
    Name = "event-processor"
    Path = Join-Path $RepoRoot "services\event-processor"
    DefaultPort = 4004
  },
  @{
    Name = "process-graph"
    Path = Join-Path $RepoRoot "services\process-graph"
    DefaultPort = 4005
  },
  @{
    Name = "integration-hub"
    Path = Join-Path $RepoRoot "services\integration-hub"
    DefaultPort = 4017
  },
  @{
    Name = "user-identity"
    Path = Join-Path $RepoRoot "services\user-identity"
    DefaultPort = 4008
  },
  @{
    Name = "navigator-ai"
    Path = Join-Path $RepoRoot "services\navigator-ai"
    DefaultPort = 4016
  }
)

function Get-PortFromEnvFile([string]$filePath) {
  if (-not (Test-Path $filePath)) {
    return $null
  }

  $lines = Get-Content -Path $filePath
  foreach ($line in $lines) {
    if ($line -match '^\s*PORT\s*=\s*([0-9]+)\s*$') {
      return [int]$Matches[1]
    }
  }

  return $null
}

function Get-ServiceEnvMap([string]$servicePath) {
  $envPath = Join-Path $servicePath ".env"
  $fallbackPath = Join-Path $servicePath ".env.example"
  $sourcePath = if (Test-Path $envPath) { $envPath } elseif (Test-Path $fallbackPath) { $fallbackPath } else { $null }

  $map = @{}
  if (-not $sourcePath) {
    return $map
  }

  $lines = Get-Content -Path $sourcePath
  foreach ($line in $lines) {
    if ($line -match '^\s*#') {
      continue
    }
    if ($line -match '^\s*$') {
      continue
    }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $key = $Matches[1]
      $value = $Matches[2]
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $map[$key] = $value
    }
  }

  return $map
}

function Resolve-Service($template) {
  $envMap = Get-ServiceEnvMap -servicePath $template.Path
  $envPort = $null
  if ($envMap.ContainsKey("PORT") -and $envMap["PORT"] -match '^[0-9]+$') {
    $envPort = [int]$envMap["PORT"]
  }

  $port = if ($null -ne $envPort) { $envPort } else { [int]$template.DefaultPort }
  $healthPath = if ($template.ContainsKey("HealthPath")) { [string]$template.HealthPath } else { "/health" }
  $startCommand = if ($template.ContainsKey("StartCommand")) { [string]$template.StartCommand } else { "npm run dev" }
  $includeInResetDb = if ($template.ContainsKey("IncludeInResetDb")) { [bool]$template.IncludeInResetDb } else { $true }

  return @{
    Name = $template.Name
    Path = $template.Path
    Port = $port
    HealthUrl = "http://localhost:$port$healthPath"
    StartCommand = $startCommand
    IncludeInResetDb = $includeInResetDb
    EnvMap = $envMap
  }
}

function Get-Services {
  $resolved = @()
  foreach ($template in $ServiceTemplates) {
    $resolved += Resolve-Service -template $template
  }

  return $resolved
}

function Ensure-Directories {
  if (-not (Test-Path $RuntimeDir)) {
    New-Item -Path $RuntimeDir -ItemType Directory | Out-Null
  }

  if (-not (Test-Path $LogsDir)) {
    New-Item -Path $LogsDir -ItemType Directory | Out-Null
  }
}

function Load-State {
  if (-not (Test-Path $StatePath)) {
    return @{}
  }

  $raw = Get-Content -Path $StatePath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @{}
  }

  $parsed = $raw | ConvertFrom-Json
  $map = @{}
  foreach ($entry in $parsed.services) {
    $map[$entry.name] = @{
      pid = [int]$entry.pid
      startedAt = [string]$entry.startedAt
      stdout = [string]$entry.stdout
      stderr = [string]$entry.stderr
    }
  }

  return $map
}

function Save-State($stateMap) {
  Ensure-Directories
  $services = @()
  foreach ($name in $stateMap.Keys) {
    $entry = $stateMap[$name]
    $services += [PSCustomObject]@{
      name = $name
      pid = $entry.pid
      startedAt = $entry.startedAt
      stdout = $entry.stdout
      stderr = $entry.stderr
    }
  }

  $payload = [PSCustomObject]@{ services = $services }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -Path $StatePath
}

function Try-GetProcess([int]$procId) {
  try {
    return Get-Process -Id $procId -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-ListeningPids([int]$port) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    return @()
  }

  return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Wait-ForPort([int]$port, [int]$timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ((Get-ListeningPids -port $port).Count -gt 0) {
      return $true
    }

    Start-Sleep -Seconds 1
  }

  return $false
}

function Start-OneService($svc, [hashtable]$state) {
  if (-not (Test-Path $svc.Path)) {
    throw "Service path not found for $($svc.Name): $($svc.Path)"
  }

  if ($state.ContainsKey($svc.Name)) {
    $existingPid = [int]$state[$svc.Name].pid
    if (Try-GetProcess -procId $existingPid) {
      Write-Host "[skip] $($svc.Name) already running (pid $existingPid)"
      return
    }
  }

  $listeners = Get-ListeningPids -port $svc.Port
  if ($listeners.Count -gt 0) {
    if (-not $KillPorts) {
      throw "Port $($svc.Port) is already in use by pid(s): $($listeners -join ', '). Re-run with -KillPorts or run killports first."
    }

    foreach ($listenerPid in $listeners) {
      Write-Host "[kill] Port $($svc.Port) blocking pid $listenerPid"
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }
  }

  $stdout = Join-Path $LogsDir "$($svc.Name).out.log"
  $stderr = Join-Path $LogsDir "$($svc.Name).err.log"

  Write-Host "[start] $($svc.Name)"
  $setParts = @("set PORT=$($svc.Port)")
  if ($svc.ContainsKey("EnvMap")) {
    foreach ($key in $svc.EnvMap.Keys) {
      $value = [string]$svc.EnvMap[$key]
      $escaped = $value.Replace('"', '""')
      $setParts += "set `"$key=$escaped`""
    }
  }
  $startCommand = [string]$svc.StartCommand
  if ([string]::IsNullOrWhiteSpace($startCommand)) {
    $startCommand = "npm run dev"
  }

  $startCommand = $startCommand.Replace("{port}", [string]$svc.Port)
  $cmdLine = ($setParts -join " && ") + " && " + $startCommand
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", $cmdLine) -WorkingDirectory $svc.Path -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

  if (-not (Wait-ForPort -port $svc.Port -timeoutSeconds $TimeoutSeconds)) {
    $tail = ""
    if (Test-Path $stderr) {
      $tail = (Get-Content -Path $stderr -Tail 20 | Out-String)
    }

    throw "Timed out waiting for $($svc.Name) on port $($svc.Port). Last stderr lines:`n$tail"
  }

  $state[$svc.Name] = @{
    pid = $proc.Id
    startedAt = (Get-Date).ToString("o")
    stdout = $stdout
    stderr = $stderr
  }

  Write-Host "[ready] $($svc.Name) listening on $($svc.Port) (pid $($proc.Id))"
}

function Stop-OneService($svc, [hashtable]$state) {
  $stopped = $false

  if ($state.ContainsKey($svc.Name)) {
    $trackedProcId = [int]$state[$svc.Name].pid
    $proc = Try-GetProcess -procId $trackedProcId
    if ($proc) {
      Write-Host "[stop] $($svc.Name) (pid $trackedProcId)"
      Stop-Process -Id $trackedProcId -Force -ErrorAction SilentlyContinue
      $stopped = $true
    }

    $state.Remove($svc.Name)
  }

  if ($KillPorts) {
    $listeners = Get-ListeningPids -port $svc.Port
    foreach ($listenerPid in $listeners) {
      Write-Host "[kill] Port $($svc.Port) blocking pid $listenerPid"
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
      $stopped = $true
    }
  }

  if (-not $stopped) {
    Write-Host "[skip] $($svc.Name) was not running"
  }
}

function Show-Status([hashtable]$state) {
  $rows = foreach ($svc in (Get-Services)) {
    $trackedPid = $null
    $trackedAlive = $false
    if ($state.ContainsKey($svc.Name)) {
      $trackedPid = [int]$state[$svc.Name].pid
      $trackedAlive = [bool](Try-GetProcess -procId $trackedPid)
    }

    $listeners = Get-ListeningPids -port $svc.Port
    [PSCustomObject]@{
      Service = $svc.Name
      Port = $svc.Port
      TrackedPid = $trackedPid
      TrackedAlive = $trackedAlive
      ListeningPids = if ($listeners.Count -gt 0) { $listeners -join "," } else { "" }
      Path = $svc.Path
    }
  }

  $rows | Format-Table -AutoSize
}

function Get-HealthRow($svc) {
  $httpCode = $null
  $statusValue = ""
  $replayValue = ""
  $healthy = $false
  $errorText = ""

  try {
    $response = Invoke-WebRequest -Uri $svc.HealthUrl -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $httpCode = [int]$response.StatusCode

    if ($response.Content) {
      try {
        $payload = $response.Content | ConvertFrom-Json
        if ($null -ne $payload.status) {
          $statusValue = [string]$payload.status
        }

        if ($null -ne $payload.replayStatus) {
          $replayValue = [string]$payload.replayStatus
        }
      } catch {
        # Non-JSON health payloads are allowed.
      }
    }

    $healthy = ($httpCode -eq 200)
    if ($statusValue) {
      $healthy = $healthy -and ($statusValue -eq "ok")
    }
    if ($replayValue) {
      $healthy = $healthy -and ($replayValue -eq "Ready")
    }
  } catch {
    $errorText = $_.Exception.Message
  }

  return [PSCustomObject]@{
    Service = $svc.Name
    Port = $svc.Port
    HealthUrl = $svc.HealthUrl
    HttpCode = $httpCode
    Status = $statusValue
    ReplayStatus = $replayValue
    Healthy = $healthy
    Error = $errorText
  }
}

function Show-Health {
  $rows = foreach ($svc in (Get-Services)) {
    Get-HealthRow -svc $svc
  }

  $rows | Format-Table Service, Port, HttpCode, Status, ReplayStatus, Healthy, Error -AutoSize

  $allHealthy = -not ($rows | Where-Object { -not $_.Healthy })
  if ($allHealthy) {
    Write-Host "All services healthy."
  } else {
    Write-Host "One or more services are unhealthy."
  }
}

function Kill-AllKnownPorts {
  foreach ($svc in (Get-Services)) {
    $listeners = Get-ListeningPids -port $svc.Port
    if ($listeners.Count -eq 0) {
      Write-Host "[skip] Port $($svc.Port) clear"
      continue
    }

    foreach ($listenerPid in $listeners) {
      Write-Host "[kill] $($svc.Name) port $($svc.Port) pid $listenerPid"
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-ReverseServices {
  $reverse = @()
  $services = Get-Services
  for ($i = $services.Count - 1; $i -ge 0; $i--) {
    $reverse += $services[$i]
  }

  return $reverse
}

function Get-ServiceDatabasePath($svc) {
  $databasePath = $null
  if ($svc.ContainsKey("EnvMap") -and $svc.EnvMap.ContainsKey("DATABASE_PATH")) {
    $databasePath = [string]$svc.EnvMap["DATABASE_PATH"]
  }

  if ([string]::IsNullOrWhiteSpace($databasePath)) {
    switch ($svc.Name) {
      "foundation-erp" { $databasePath = "foundation.db" }
      "authority-engine" { $databasePath = "authority.db" }
      "governance-engine" { $databasePath = "governance.db" }
      "mesh-gateway" { $databasePath = "mesh-gateway.db" }
      "event-processor" { $databasePath = "event-processor.db" }
      "process-graph" { $databasePath = "process-graph.db" }
      "integration-hub" { $databasePath = "integration-hub.db" }
      "user-identity" { $databasePath = "user-identity.db" }
      "navigator-ai" { $databasePath = "navigator-ai.db" }
    }
  }

  if ([string]::IsNullOrWhiteSpace($databasePath)) {
    return $null
  }

  if ([System.IO.Path]::IsPathRooted($databasePath)) {
    return $databasePath
  }

  return (Join-Path $svc.Path $databasePath)
}

function Remove-ServiceDatabaseFiles($svc) {
  Stop-ServiceNodeProcesses -svc $svc

  $basePath = Get-ServiceDatabasePath -svc $svc
  if (-not $basePath) {
    Write-Host "[skip] $($svc.Name) database path unresolved"
    return
  }

  $targets = @($basePath, "$basePath-wal", "$basePath-shm")
  foreach ($target in $targets) {
    if (Test-Path $target) {
      try {
        Remove-Item -Path $target -Force -ErrorAction Stop
        Write-Host "[resetdb] removed $target"
      } catch {
        Stop-ServiceNodeProcesses -svc $svc
        Remove-Item -Path $target -Force -ErrorAction Stop
        Write-Host "[resetdb] removed $target"
      }
    } else {
      Write-Host "[resetdb] not found $target"
    }
  }
}

function Stop-ServiceNodeProcesses($svc) {
  $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and $_.CommandLine -match [regex]::Escape($svc.Path)
    }

  foreach ($proc in $nodeProcesses) {
    try {
      Write-Host "[resetdb] stopping node process $($proc.ProcessId) for $($svc.Name)"
      Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction Stop
    } catch {
      # Ignore failures; delete step will report if lock remains.
    }
  }
}

function Invoke-ServiceMigrate($svc) {
  if (-not (Test-Path $svc.Path)) {
    throw "Service path not found for $($svc.Name): $($svc.Path)"
  }

  $packagePath = Join-Path $svc.Path "package.json"
  if (-not (Test-Path $packagePath)) {
    Write-Host "[skip] $($svc.Name) has no package.json"
    return
  }

  Write-Host "[migrate] $($svc.Name)"
  Push-Location $svc.Path
  try {
    & npm run migrate
    if ($LASTEXITCODE -ne 0) {
      throw "npm run migrate failed for $($svc.Name)"
    }
  } finally {
    Pop-Location
  }
}

Ensure-Directories
$state = Load-State

switch ($Action) {
  "start" {
    foreach ($svc in (Get-Services)) {
      Start-OneService -svc $svc -state $state
      Save-State -stateMap $state
    }

    Write-Host "All services started."
    Show-Status -state $state
  }

  "stop" {
    foreach ($svc in (Get-ReverseServices)) {
      Stop-OneService -svc $svc -state $state
      Save-State -stateMap $state
    }

    Write-Host "Stop operation complete."
    Show-Status -state $state
  }

  "restart" {
    foreach ($svc in (Get-ReverseServices)) {
      Stop-OneService -svc $svc -state $state
      Save-State -stateMap $state
    }

    foreach ($svc in (Get-Services)) {
      Start-OneService -svc $svc -state $state
      Save-State -stateMap $state
    }

    Write-Host "All services restarted."
    Show-Status -state $state
  }

  "status" {
    Show-Status -state $state
  }

  "health" {
    Show-Health
  }

  "killports" {
    Kill-AllKnownPorts

    foreach ($svc in (Get-Services)) {
      if ($state.ContainsKey($svc.Name)) {
        $trackedProcId = [int]$state[$svc.Name].pid
        if (-not (Try-GetProcess -procId $trackedProcId)) {
          $state.Remove($svc.Name)
        }
      }
    }

    Save-State -stateMap $state
    Show-Status -state $state
  }

  "resetdb" {
    foreach ($svc in (Get-ReverseServices)) {
      Stop-OneService -svc $svc -state $state
      Save-State -stateMap $state
    }

    Kill-AllKnownPorts

    foreach ($svc in (Get-Services | Where-Object { $_.IncludeInResetDb })) {
      Remove-ServiceDatabaseFiles -svc $svc
    }

    foreach ($svc in (Get-Services | Where-Object { $_.IncludeInResetDb })) {
      Invoke-ServiceMigrate -svc $svc
    }

    Write-Host "SQLite reset complete. Databases recreated by migrations."
    Show-Status -state $state
  }
}
