$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$xlsx = Join-Path $root 'output/water-report.xlsx'
$summary = Join-Path $root 'output/summary.html'
if (-not (Test-Path -LiteralPath $xlsx) -or -not (Test-Path -LiteralPath $summary)) { throw 'Required Excel artifacts missing' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($xlsx)
try {
  if (-not ($zip.Entries.FullName -contains '[Content_Types].xml')) { throw 'Invalid XLSX package' }
  $sheets = @($zip.Entries | Where-Object { $_.FullName -match '^xl/worksheets/sheet\d+\.xml$' })
  if ($sheets.Count -lt 3) { throw "Expected at least 3 sheets, got $($sheets.Count)" }
  $charts = @($zip.Entries | Where-Object { $_.FullName -match '^xl/charts/chart\d+\.xml$' })
  if ($charts.Count -lt 3) { throw "Expected at least 3 charts, got $($charts.Count)" }
  Write-Output 'xlsx verification passed'
} finally { $zip.Dispose() }
