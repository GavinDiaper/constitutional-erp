param(
  [string]$Path = "logs",
  [string]$Pattern = "*.log",
  [switch]$Recurse
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
Set-Location $Root

$targetPath = if ([System.IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $Root $Path }
if (-not (Test-Path $targetPath)) {
  throw "Target path not found: $targetPath"
}

$files = Get-ChildItem -Path $targetPath -File -Filter $Pattern -Recurse:$Recurse -ErrorAction Stop
if (-not $files -or $files.Count -eq 0) {
  Write-Host "No files matched pattern '$Pattern' in $targetPath"
  exit 0
}

$truncatedCount = 0
$skippedCount = 0
$bytesFreed = 0L

foreach ($file in $files) {
  $originalLength = [int64]$file.Length
  try {
    $stream = [System.IO.File]::Open($file.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
    try {
      $stream.SetLength(0)
      $truncatedCount += 1
      $bytesFreed += $originalLength
      Write-Host "[truncated] $($file.FullName)"
    } finally {
      $stream.Dispose()
    }
  } catch {
    $skippedCount += 1
    Write-Warning "[skipped] $($file.FullName): $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Done. Truncated: $truncatedCount, Skipped: $skippedCount, Bytes removed: $bytesFreed"
if ($skippedCount -gt 0) {
  exit 1
}

exit 0
