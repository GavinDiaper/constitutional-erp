param(
  [string]$SourceRoot = $PSScriptRoot,
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

function Get-RepoRoots([string]$root) {
  $repoRoots = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)

  $ignoreFiles = Get-ChildItem -Path $root -Filter ".gitignore" -File -Recurse -Force -ErrorAction SilentlyContinue
  foreach ($ignoreFile in $ignoreFiles) {
    $candidate = $ignoreFile.DirectoryName
    $topLevel = ""

    try {
      $topLevel = (& git -C $candidate rev-parse --show-toplevel 2>$null).Trim()
    } catch {
      $topLevel = ""
    }

    if ([string]::IsNullOrWhiteSpace($topLevel)) {
      continue
    }

    $full = Normalize-Path $topLevel
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      [void]$repoRoots.Add($full)
    }
  }

  return @($repoRoots | ForEach-Object { $_ }) | Sort-Object
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

function Is-UnderAnyRepo([string]$filePath, [string[]]$repoRoots) {
  foreach ($repoRoot in $repoRoots) {
    $prefix = $repoRoot.TrimEnd('\') + "\"
    if ($filePath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  return $false
}

function Copy-NonRepoFiles([string]$sourceRoot, [string]$destinationRoot, [string[]]$repoRoots, [switch]$dryRun) {
  $files = Get-ChildItem -Path $sourceRoot -File -Recurse -Force -ErrorAction SilentlyContinue
  $count = 0

  foreach ($file in $files) {
    $sourceFile = Normalize-Path $file.FullName

    if ($sourceFile -like "*\\.git\\*") {
      continue
    }

    if (Is-UnderAnyRepo -filePath $sourceFile -repoRoots $repoRoots) {
      continue
    }

    $relative = Get-RelativePath -basePath $sourceRoot -targetPath $sourceFile
    $destinationFile = Join-Path $destinationRoot $relative
    $destinationDir = Split-Path -Parent $destinationFile
    Ensure-Directory $destinationDir

    if (-not $dryRun) {
      Copy-Item -LiteralPath $sourceFile -Destination $destinationFile -Force
    }

    $count += 1
  }

  Write-Info "Copied $count non-repo file(s)."
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

$repoRoots = Get-RepoRoots -root $sourceRootFull
Write-Info "Discovered $($repoRoots.Count) git repo root(s)."
foreach ($repoRoot in $repoRoots) {
  Write-Info "Repo root: $repoRoot"
}

$total = 0
foreach ($repoRoot in $repoRoots) {
  $total += Copy-GitFiles -repoRoot $repoRoot -sourceRoot $sourceRootFull -destinationRoot $destinationRootFull -dryRun:$DryRun
}

$total += Copy-NonRepoFiles -sourceRoot $sourceRootFull -destinationRoot $destinationRootFull -repoRoots $repoRoots -dryRun:$DryRun

Write-Info "Done. Total file(s) processed: $total"
