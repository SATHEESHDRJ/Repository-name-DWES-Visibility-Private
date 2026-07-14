# Creates desktop shortcuts for DWES Dev (HMR) and optional Prod.
# Default: single DWES.lnk → Start DWES (Hidden).vbs (Development Mode / Vite HMR).
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fix-desktop-shortcut.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fix-desktop-shortcut.ps1 -IncludeProd
param(
  [switch]$IncludeProd
)

$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
$sh = New-Object -ComObject WScript.Shell
$root = Split-Path $PSScriptRoot -Parent
$launcherDev = Join-Path $root 'Start DWES (Hidden).vbs'
$launcherProd = Join-Path $root 'Start DWES Prod (Hidden).vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$icon = Join-Path $root 'public\app-icon.ico'
$primaryName = 'Start DWES.lnk'
$primary = Join-Path $desktop $primaryName
$stopName = 'Stop DWES.lnk'
$stopShortcut = Join-Path $desktop $stopName
$prodName = 'Start DWES (Production).lnk'
$prodShortcut = Join-Path $desktop $prodName

if (-not (Test-Path $launcherDev)) { throw "Dev launcher not found: $launcherDev" }
if (-not (Test-Path $wscript)) { throw "wscript.exe not found: $wscript" }
if (-not (Test-Path $icon)) { throw "Icon not found: $icon. Run: npm run icons:generate" }

function Test-IsDwesLaunchShortcut([string]$shortcutPath) {
  if (-not (Test-Path $shortcutPath)) { return $false }
  $ext = [System.IO.Path]::GetExtension($shortcutPath).ToLowerInvariant()
  if ($ext -eq '.url') {
    $content = Get-Content $shortcutPath -Raw -ErrorAction SilentlyContinue
    return ($content -match 'localhost' -and $content -match 'DWES|5175|5173|8080')
  }
  if ($ext -ne '.lnk') { return $false }
  try {
    $s = $sh.CreateShortcut($shortcutPath)
    $t = $s.TargetPath
    $args = $s.Arguments
    if ($t -match 'DWES' -or $t -match 'Start DWES') { return $true }
    if ($t -match 'chrome_proxy' -and ($args -match 'DWES|lgkepoeojodnooohdeofgdojhhdbgbjf')) { return $true }
    if ($s.WorkingDirectory -match 'DWES') { return $true }
  } catch { return $false }
  return $false
}

$removed = @()
$kept = @()

# Pass 1: remove obvious DWES shortcut patterns (.lnk / .url only).
foreach ($pattern in @('DWES*.lnk', 'DWES*.url')) {
  Get-ChildItem $desktop -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Force
    $removed += $_.Name
  }
}

# Pass 2: remove misnamed DWES launch shortcuts (e.g. Digital_Wiri*.lnk).
Get-ChildItem $desktop -File -ErrorAction SilentlyContinue | Where-Object {
  $_.Extension -in '.lnk', '.url' -and $_.Name -match 'Digital.*Wir|Wiring.*Execution'
} | ForEach-Object {
  if (Test-IsDwesLaunchShortcut $_.FullName) {
    Remove-Item $_.FullName -Force
    $removed += $_.Name
  } else {
    $kept += "$($_.Name) (not a DWES launcher - skipped)"
  }
}

# Canonical Dev shortcut (Vite HMR — code changes appear without restart).
# TargetPath = wscript.exe (windowless host) so no console flashes regardless of
# how .vbs files are associated on this machine. Arguments = the hidden VBS launcher.
$sc = $sh.CreateShortcut($primary)
$sc.TargetPath = $wscript
$sc.Arguments = ('"{0}"' -f $launcherDev)
$sc.WorkingDirectory = $root
$sc.IconLocation = "$icon,0"
$sc.WindowStyle = 1
$sc.Description = 'DWES Development — Vite HMR on :5175 (no console windows)'
$sc.Save()

$stop = $sh.CreateShortcut($stopShortcut)
$stop.TargetPath = $wscript
$stop.Arguments = ('"{0}"' -f (Join-Path $root 'Stop DWES (Hidden).vbs'))
$stop.WorkingDirectory = $root
$stop.IconLocation = "$icon,0"
$stop.WindowStyle = 1
$stop.Description = 'Stop DWES background processes (no console windows)'
$stop.Save()

if ($IncludeProd) {
  if (-not (Test-Path $launcherProd)) { throw "Prod launcher not found: $launcherProd" }
  $scp = $sh.CreateShortcut($prodShortcut)
  $scp.TargetPath = $wscript
  $scp.Arguments = ('"{0}"' -f $launcherProd)
  $scp.WorkingDirectory = $root
  $scp.IconLocation = "$icon,0"
  $scp.WindowStyle = 1
  $scp.Description = 'DWES Production — vite preview (no HMR)'
  $scp.Save()
}

# Start Menu shortcut (same windowless wscript → VBS target) so DWES launches
# from Start Menu search as well as the Desktop icon.
$startMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'DWES'
New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
$smShortcut = Join-Path $startMenuDir 'DWES.lnk'
$sm = $sh.CreateShortcut($smShortcut)
$sm.TargetPath = $wscript
$sm.Arguments = ('"{0}"' -f $launcherDev)
$sm.WorkingDirectory = $root
$sm.IconLocation = "$icon,0"
$sm.WindowStyle = 1
$sm.Description = 'DWES Development — Vite HMR on :5175 (no console windows)'
$sm.Save()

Write-Host ''
Write-Host '[DWES] Desktop launcher ready (Development Mode = default)'
Write-Host "  Shortcut : $primary"
Write-Host "  Target   : $wscript"
Write-Host "  Runs     : $launcherDev (windowless)"
Write-Host "  StartMenu: $smShortcut"
Write-Host '  Opens    : http://localhost:5175/ (Vite HMR — edit src/ and see live updates)'
Write-Host '  Mode     : Dev (npm run dev + backend start:dev)'
Write-Host "  Stop     : $stopShortcut"
if ($IncludeProd) {
  Write-Host "  Prod     : $prodShortcut → $launcherProd"
}
Write-Host '  Stop     : double-click Stop DWES.cmd in the repo folder'
Write-Host '  Recreate : npm run shortcut:create'
Write-Host ''
if ($removed.Count) {
  Write-Host '  Deleted shortcuts:'
  $removed | Sort-Object -Unique | ForEach-Object { Write-Host "    - $_" }
}
if ($kept.Count) {
  Write-Host '  Kept (verified not DWES launchers):'
  $kept | ForEach-Object { Write-Host "    - $_" }
}
Write-Host ''
