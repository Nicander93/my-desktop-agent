$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'output/local-model-agent.pptx'
if (-not (Test-Path -LiteralPath $path)) { throw 'PPTX missing' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)
try {
  $slides = @($zip.Entries | Where-Object { $_.FullName -match '^ppt/slides/slide\d+\.xml$' })
  if ($slides.Count -lt 8 -or $slides.Count -gt 10) { throw "Expected 8-10 slides, got $($slides.Count)" }
  foreach ($slide in $slides) { if ($slide.Length -lt 300) { throw "Blank slide: $($slide.FullName)" } }
  if (-not ($zip.Entries.FullName -contains 'ppt/presentation.xml')) { throw 'Invalid PPTX package' }
  Write-Output 'pptx verification passed'
} finally { $zip.Dispose() }
