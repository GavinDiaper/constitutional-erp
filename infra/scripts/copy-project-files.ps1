param(
  [string]$SourceRoot = (Join-Path $PSScriptRoot "..\.."),
  [string]$DestinationRoot = "E:\ERP",
  [switch]$DryRun,
  [switch]$CleanDestination
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$message) {
  Write-Host "[copy-project-files] $message"
}

function Normalize-Path([string]$value) {
  return [System.IO.Path]::GetFullPath($value).TrimEnd('\')
}

function Ensure-Directory([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

function Get-NextVersionDirectory([string]$baseRoot) {
  Ensure-Directory $baseRoot

  $maxVersion = 0
  $dirs = Get-ChildItem -Path $baseRoot -Directory -ErrorAction SilentlyContinue

  foreach ($dir in $dirs) {
    if ($dir.Name -match '^version[ _-]?(\d{3})$') {
      $version = [int]$Matches[1]
      if ($version -gt $maxVersion) {
        $maxVersion = $version
      }
    }
  }

  $nextVersion = $maxVersion + 1
  $versionName = "version {0:D3}" -f $nextVersion
  $versionPath = Join-Path $baseRoot $versionName

  return [PSCustomObject]@{
    Version = $nextVersion
    Name = $versionName
    Path = $versionPath
  }
}

function Get-RelativePath([string]$basePath, [string]$targetPath) {
  $baseFull = Normalize-Path $basePath
  $targetFull = Normalize-Path $targetPath

  if ($targetFull.Equals($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return "."
  }

  $basePrefix = $baseFull.TrimEnd('\') + "\"
  if ($targetFull.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $targetFull.Substring($basePrefix.Length)
  }

  $baseUri = New-Object System.Uri(($baseFull.TrimEnd('\') + "\"))
  $targetUri = New-Object System.Uri($targetFull)
  $relativeUri = $baseUri.MakeRelativeUri($targetUri)
  $relative = [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '\')

  if ([string]::IsNullOrWhiteSpace($relative)) {
    return "."
  }

  return $relative
}

function Resolve-RepoRoot([string]$path) {
  $resolved = ""

  try {
    $resolved = (& git -C $path rev-parse --show-toplevel 2>$null).Trim()
  } catch {
    $resolved = ""
  }

  if ([string]::IsNullOrWhiteSpace($resolved)) {
    throw "Unable to resolve a git repository root from path: $path"
  }

  return Normalize-Path $resolved
}

function Copy-GitFiles([string]$repoRoot, [string]$sourceRoot, [string]$destinationRoot, [switch]$dryRun) {
  $repoRelative = Get-RelativePath -basePath $sourceRoot -targetPath $repoRoot
  if ($repoRelative.StartsWith("..")) {
    throw "Repo root resolved outside source root: $repoRoot"
  }
  $destinationRepoRoot = if ($repoRelative -eq ".") { $destinationRoot } else { Join-Path $destinationRoot $repoRelative }
  Ensure-Directory $destinationRepoRoot

  $files = & git -c core.quotepath=false -C $repoRoot ls-files --cached --others --exclude-standard
  $count = 0

  foreach ($file in $files) {
    if ([string]::IsNullOrWhiteSpace($file)) {
      continue
    }

    $sourceFile = Join-Path $repoRoot $file
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
      continue
    }

    $destinationFile = Join-Path $destinationRepoRoot $file
    $destinationDir = Split-Path -Parent $destinationFile
    Ensure-Directory $destinationDir

    if (-not $dryRun) {
      Copy-Item -LiteralPath $sourceFile -Destination $destinationFile -Force
    }

    $count += 1
  }

  Write-Info "Copied $count file(s) from repo: $repoRoot"
  return $count
}

$sourceRootFull = Normalize-Path $SourceRoot
$destinationBaseRootFull = Normalize-Path $DestinationRoot

if (-not (Test-Path -LiteralPath $sourceRootFull -PathType Container)) {
  throw "Source root does not exist: $sourceRootFull"
}

$versionTarget = Get-NextVersionDirectory -baseRoot $destinationBaseRootFull
$destinationRootFull = $versionTarget.Path

Write-Info "Destination base: $destinationBaseRootFull"
Write-Info "Version folder: $($versionTarget.Name)"
Write-Info "Destination path: $destinationRootFull"

if (-not $DryRun) {
  Ensure-Directory $destinationRootFull
}

if ($CleanDestination -and -not $DryRun) {
  Write-Info "Cleaning destination: $destinationRootFull"
  Get-ChildItem -Path $destinationRootFull -Force | Remove-Item -Recurse -Force
}

$repoRoot = Resolve-RepoRoot -path $sourceRootFull
Write-Info "Repo root: $repoRoot"

$sourceRootFull = $repoRoot

$total = Copy-GitFiles -repoRoot $repoRoot -sourceRoot $sourceRootFull -destinationRoot $destinationRootFull -dryRun:$DryRun

Write-Info "Done. Total file(s) processed: $total"
