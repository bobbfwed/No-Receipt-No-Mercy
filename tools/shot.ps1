# Takes a screenshot of a page with headless Edge, to check by eye how the game looks.
# The dev server must be running first:  node tools/serve.mjs
# Usage: shot.ps1 -Url "http://localhost:5173/?demo=1" -Out "C:\path\shot.png" [-Width 1280] [-Height 720] [-WaitMs 4000]
# -WaitMs is how long the page is allowed to run (in page time) before the picture is taken.
# Add -Dom to also save the page's final HTML next to the picture (as .html), to look for error text.
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 1280,
  [int]$Height = 720,
  [int]$WaitMs = 4000,
  [switch]$Dom
)
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$outDir = Split-Path -Parent $Out
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }
$profileDir = Join-Path $env:TEMP ("edge-shot-" + [guid]::NewGuid().ToString("N"))
$common = @(
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--mute-audio",
  "--user-data-dir=`"$profileDir`"", "--window-size=$Width,$Height", "--virtual-time-budget=$WaitMs"
)
Start-Process -FilePath $edge -ArgumentList ($common + @("--screenshot=`"$Out`"", "`"$Url`"")) -Wait -WindowStyle Hidden
if ($Dom) {
  $domOut = [System.IO.Path]::ChangeExtension($Out, ".html")
  Start-Process -FilePath $edge -ArgumentList ($common + @("--dump-dom", "`"$Url`"")) -Wait -WindowStyle Hidden -RedirectStandardOutput $domOut
  Write-Output "DOM $domOut"
}
Start-Sleep -Milliseconds 300
Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $Out) { Write-Output "OK $Out" } else { Write-Output "FAILED: no screenshot written for $Url"; exit 1 }
