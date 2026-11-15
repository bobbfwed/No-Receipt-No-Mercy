# Renders an SVG (or HTML) file to a PNG with headless Edge, so a drawing can be checked by eye.
# Usage: render.ps1 -Svg <path to .svg or .html> -Out <path to .png> [-Width 1280] [-Height 720]
param(
  [Parameter(Mandatory = $true)][string]$Svg,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 1280,
  [int]$Height = 720
)
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$full = (Resolve-Path -LiteralPath $Svg).Path
$uri = ([System.Uri]$full).AbsoluteUri
$outDir = Split-Path -Parent $Out
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }
# A private profile folder per run lets several renders happen at the same time.
$profileDir = Join-Path $env:TEMP ("edge-render-" + [guid]::NewGuid().ToString("N"))
$edgeArgs = @(
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  "--user-data-dir=`"$profileDir`"",
  "--window-size=$Width,$Height",
  "--screenshot=`"$Out`"",
  "`"$uri`""
)
Start-Process -FilePath $edge -ArgumentList $edgeArgs -Wait -WindowStyle Hidden
Start-Sleep -Milliseconds 300
Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $Out) { Write-Output "OK $Out" } else { Write-Output "FAILED: no screenshot written for $full"; exit 1 }
