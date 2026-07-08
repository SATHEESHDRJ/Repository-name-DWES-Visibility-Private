# Creates exactly ONE desktop shortcut: DWES.lnk
# Removes duplicate DWES app-launch shortcuts only (never folders or unrelated apps).
$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
$sh = New-Object -ComObject WScript.Shell
$root = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $root 'Start DWES (Hidden).vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$icon = Join-Path $root 'public\app-icon.ico'
$primaryName = 'DWES.lnk'
$primary = Join-Path $desktop $primaryName

if (-not (Test-Path $launcher)) { throw "Launcher not found: $launcher" }
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

# Create the single canonical shortcut (VBS opens via default wscript handler — no console).
$sc = $sh.CreateShortcut($primary)
$sc.TargetPath = $launcher
$sc.Arguments = ''
$sc.WorkingDirectory = $root
$sc.IconLocation = "$icon,0"
$sc.WindowStyle = 1
$sc.Description = 'DWES - start hidden (no console windows)'
$sc.Save()

Write-Host ''
Write-Host '[DWES] Single desktop launcher ready'
Write-Host "  Shortcut : $primary"
Write-Host "  Target   : $launcher"
Write-Host '  Opens    : http://localhost:5175/ (port from package.json dev script)'
Write-Host '  Stop     : double-click Stop DWES.vbs in the repo folder'
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
